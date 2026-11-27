"""Immutable full-series Parquet revisions + transactional DuckDB publication.

One OS writer lock covers catalog readers too (DuckDB cross-process safety).
An interrupted publication can leave an unreferenced immutable file, never a valid
catalog entry pointing to a partial file. No automatic deletion of snapshot files.
"""
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import uuid

import duckdb
from filelock import FileLock
import pyarrow as pa
import pyarrow.parquet as pq

from .model import Candle, NORMAL_GAPS, Status, TIMEFRAMES, interval, runs


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def now():
    return datetime.now(timezone.utc).isoformat()


class QualityError(ValueError):
    pass


class Store:
    def __init__(self, root):
        self.root = Path(root).resolve()
        for name in ("catalog", "raw", "ohlcv", "backtest_results"):
            (self.root / name).mkdir(parents=True, exist_ok=True)
        self.lock = FileLock(str(self.root / "catalog" / "writer.lock"), timeout=30)
        with self.connect() as db:
            db.execute("CREATE SEQUENCE IF NOT EXISTS event_seq START 1")
            db.execute("""CREATE TABLE IF NOT EXISTS snapshots(
                revision VARCHAR PRIMARY KEY, series VARCHAR, path VARCHAR, sha256 VARCHAR,
                rows BIGINT, min_time BIGINT, max_time BIGINT, created_at VARCHAR,
                parent VARCHAR, metadata VARCHAR)""")
            db.execute("CREATE TABLE IF NOT EXISTS heads(series VARCHAR PRIMARY KEY, revision VARCHAR)")
            db.execute("""CREATE TABLE IF NOT EXISTS coverage(
                seq BIGINT DEFAULT nextval('event_seq'), series VARCHAR, start BIGINT,
                stop BIGINT, status VARCHAR, evidence VARCHAR, revision VARCHAR,
                checked_at VARCHAR, retry_count INTEGER, next_retry_at DOUBLE)""")

    @contextmanager
    def connect(self):
        with self.lock:
            db = duckdb.connect(str(self.root / "catalog" / "market.duckdb"))
            try:
                yield db
            finally:
                db.close()

    def _head(self, db, key):
        row = db.execute("SELECT revision FROM heads WHERE series=?", [key]).fetchone()
        return row[0] if row else None

    def _read(self, db, key, revision=None, allow_stale=False):
        explicit_revision = revision is not None
        revision = revision or self._head(db, key)
        if revision is None:
            return [], None
        cursor = db.execute("SELECT * FROM snapshots WHERE revision=? AND series=?", [revision, key])
        row = cursor.fetchone()
        if not row:
            raise QualityError("Snapshot not found for series")
        manifest = dict(zip([d[0] for d in cursor.description], row))
        metadata = json.loads(manifest["metadata"])
        if not explicit_revision and not allow_stale and metadata.get("derived_series"):
            if self._head(db, metadata["derived_series"]) != metadata["derived_from"]:
                raise QualityError("Derived snapshot is stale; resample the requested range again")
        path = self.root / manifest["path"]
        if not path.is_file() or digest(path) != manifest["sha256"]:
            self._event(db, key, manifest["min_time"], manifest["max_time"] + int(json.loads(manifest["metadata"])["step"]),
                        Status.CORRUPTED, {"reason": "snapshot checksum mismatch", "path": manifest["path"]}, revision)
            raise QualityError("Snapshot checksum mismatch; collection repair required")
        rows = [Candle.from_record(r) for r in pq.read_table(path).to_pylist()]
        if len(rows) != manifest["rows"]:
            raise QualityError("Snapshot row count mismatch")
        return rows, manifest

    def read(self, key, revision=None):
        with self.connect() as db:
            return self._read(db, key, revision)

    def _event(self, db, key, start, end, status, evidence, revision=None, retry_count=0, next_retry_at=None):
        db.execute("INSERT INTO coverage(series,start,stop,status,evidence,revision,checked_at,retry_count,next_retry_at) VALUES (?,?,?,?,?,?,?,?,?)",
                   [key, start, end, str(status), json.dumps(evidence, sort_keys=True), revision, now(), retry_count, next_retry_at])

    def mark(self, key, start, end, status, evidence, retry_count=0, next_retry_at=None):
        interval(start, end, key.split(":")[3])
        status = Status(status)
        if status == Status.VALID:
            raise ValueError("VALID requires validated Parquet publication")
        if not evidence or not evidence.get("reason"):
            raise ValueError("Classification requires evidence and reason")
        if status in NORMAL_GAPS and not (evidence.get("authority") and evidence.get("reference") and evidence.get("version")):
            raise ValueError("Normal absence requires authority, reference and version")
        with self.connect() as db:
            if status in NORMAL_GAPS:
                bars, _ = self._read(db, key)
                if any(start <= c.time < end for c in bars):
                    raise ValueError("Absence conflicts with stored candles")
            self._event(db, key, start, end, status, evidence, retry_count=retry_count, next_retry_at=next_retry_at)

    def coverage(self, key, start, end):
        interval(start, end, key.split(":")[3])
        with self.connect() as db:
            events = db.execute("SELECT start,stop,status,evidence,revision,retry_count,next_retry_at FROM coverage WHERE series=? AND start<? AND stop>? ORDER BY seq",
                                [key, end, start]).fetchall()
        segments = [{"start": start, "end": end, "status": "UNKNOWN", "evidence": {}, "revision": None, "retry_count": 0, "next_retry_at": None}]
        for a, b, status, evidence, revision, retries, retry_at in events:
            new = []
            for s in segments:
                left, right = max(s["start"], a), min(s["end"], b)
                if left >= right:
                    new.append(s)
                    continue
                if s["start"] < left:
                    new.append({**s, "end": left})
                new.append({"start": left, "end": right, "status": status, "evidence": json.loads(evidence), "revision": revision, "retry_count": retries, "next_retry_at": retry_at})
                if right < s["end"]:
                    new.append({**s, "start": right})
            segments = new
        merged = []
        for s in segments:
            if merged and merged[-1]["end"] == s["start"] and all(merged[-1][k] == s[k] for k in s if k not in ("start", "end")):
                merged[-1]["end"] = s["end"]
            else:
                merged.append(s)
        return merged

    def publish(self, key, bars, evidence, metadata=None):
        step = TIMEFRAMES[key.split(":")[3]]
        incoming = {}
        for c in bars:
            c.validate(step)
            if c.time in incoming and incoming[c.time] != c:
                raise QualityError("Conflicting duplicate in provider response")
            incoming[c.time] = c
        if not incoming:
            return None
        with self.connect() as db:
            old, parent = self._read(db, key, allow_stale=True)
            parent_meta = json.loads(parent["metadata"]) if parent else {}
            replacing_derived = bool(metadata and metadata.get("derived_series") and
                                     parent_meta.get("derived_series") == metadata["derived_series"] and
                                     parent_meta.get("derived_from") != metadata["derived_from"])
            # Regeneration from a new source version is an explicit new derived
            # snapshot; never merge old-version buckets with new-version buckets.
            if replacing_derived:
                old = []
            merged = {c.time: c for c in old}
            for t, c in incoming.items():
                if t in merged and merged[t] != c:
                    self._event(db, key, t, t + step, Status.CORRUPTED,
                                {"reason": "provider conflict; raw response quarantined", **evidence}, parent["revision"])
                    raise QualityError("Provider conflicts with immutable data; explicit correction needed")
                merged[t] = c
            if len(merged) == len(old) and not replacing_derived:
                return parent
            ordered = [merged[t] for t in sorted(merged)]
            revision = uuid.uuid4().hex
            folder = self.root / "ohlcv" / key.replace(":", "_")
            folder.mkdir(exist_ok=True)
            path = folder / f"{revision}.parquet"
            temp = path.with_suffix(".tmp")
            pq.write_table(pa.Table.from_pylist([c.record() for c in ordered]), temp, compression="zstd")
            # Buffer-backed verification releases Windows filesystem handles before
            # rename; Arrow dataset readers may otherwise retain a mapped handle.
            check = pq.read_table(pa.BufferReader(temp.read_bytes()))
            if check.num_rows != len(ordered):
                raise QualityError("Parquet verification failed")
            os.replace(temp, path)
            manifest = dict(revision=revision, series=key, path=str(path.relative_to(self.root)), sha256=digest(path),
                            rows=len(ordered), min_time=ordered[0].time, max_time=ordered[-1].time, created_at=now(),
                            parent=parent["revision"] if parent else None,
                            metadata=json.dumps({"step": step, "schema": "candle-v1", "exchange": "binance", "market": "spot", "symbol": key.split(":")[2], "timeframe": key.split(":")[3], "currency": "USDT" if key.split(":")[2].endswith("USDT") else None, "adjustment": "raw", "source": evidence, **(metadata or {})}, sort_keys=True))
            db.execute("BEGIN")
            try:
                db.execute("INSERT INTO snapshots VALUES (?,?,?,?,?,?,?,?,?,?)", list(manifest.values()))
                db.execute("INSERT OR REPLACE INTO heads VALUES (?,?)", [key, revision])
                for a, b in runs(incoming, step):
                    self._event(db, key, a, b, Status.VALID, evidence, revision)
                db.execute("COMMIT")
            except BaseException:
                db.execute("ROLLBACK")
                raise
            return manifest

    def strict(self, key, start, end, revision=None):
        step = interval(start, end, key.split(":")[3])
        with self.lock:
            bars, manifest = self.read(key, revision)
            selected = [c for c in bars if start <= c.time < end]
            # Reference execution requires every real slot, even if absence is explained.
            if len(selected) != (end - start) // step or any(c.time != start + i * step for i, c in enumerate(selected)):
                raise QualityError("Strict execution requires continuous real candles")
            for c in selected:
                c.validate(step)
            if revision is None and any(s["status"] != Status.VALID for s in self.coverage(key, start, end)):
                raise QualityError("Strict execution blocked by unresolved coverage")
            return selected, manifest

    def symbols(self):
        with self.connect() as db:
            return [r[0] for r in db.execute("SELECT series FROM heads ORDER BY series").fetchall()]
