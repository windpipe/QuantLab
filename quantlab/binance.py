"""Public Binance spot klines; no credentials, no trading endpoints."""
from decimal import Decimal
import hashlib
import json
import os
import time
import uuid

import httpx

from .model import Candle, NORMAL_GAPS, Status, interval, runs, series
from .store import QualityError, now


class Binance:
    provider = "binance-rest-v1"

    def __init__(self, base="https://api.binance.com", client=None):
        self.base = base.rstrip("/")
        self.client = client or httpx.Client(timeout=30, follow_redirects=False)

    def page(self, symbol, timeframe, start, end):
        response = self.client.get(f"{self.base}/api/v3/klines", params={
            "symbol": symbol, "interval": timeframe.replace("D", "d"), "startTime": start,
            "endTime": end - 1, "limit": 1000})
        response.raise_for_status()
        return response.content, str(response.url), response.status_code

    def parse(self, payload, step, start, end, clock):
        rows = json.loads(payload)
        if not isinstance(rows, list):
            raise QualityError("Unexpected Binance payload")
        bars = []
        previous = -1
        for r in rows:
            if not isinstance(r, list) or len(r) < 12:
                raise QualityError("Malformed Binance kline")
            t = int(r[0])
            if t < previous or not start <= t < end:
                raise QualityError("Out-of-range or unordered page")
            previous = t
            if int(r[6]) != t + step - 1:
                raise QualityError("Unexpected candle end timestamp/unit")
            c = Candle(t, *(Decimal(str(r[i])) for i in range(1, 6)), turnover=Decimal(str(r[7])))
            c.validate(step)
            if t + step > clock:
                raise QualityError("Provider returned unfinished candle")
            bars.append(c)
        return bars


class Collector:
    def __init__(self, store, provider=None, clock=time.time, sleep=time.sleep):
        self.store = store
        self.provider = provider or Binance()
        self.clock, self.sleep = clock, sleep

    def ensure(self, symbol, timeframe, start, end, max_attempts=3):
        key = series(symbol, timeframe)
        step = interval(start, end, timeframe)
        if end > int(self.clock() * 1000):
            raise QualityError("Requested interval includes future or unfinished data")
        if not 1 <= max_attempts <= 5:
            raise ValueError("Attempts must be between 1 and 5")
        calls, errors = 0, []
        with self.store.lock:
            # Detect missing/tampered files before deciding that VALID means reusable.
            self.store.read(key)
            segments = self.store.coverage(key, start, end)
            for s in segments:
                if s["status"] == Status.VALID or s["status"] in NORMAL_GAPS or s["status"] == Status.UNAVAILABLE:
                    continue
                if s["next_retry_at"] and s["next_retry_at"] > self.clock():
                    continue
                cursor = s["start"]
                while cursor < s["end"]:
                    stop = min(cursor + 1000 * step, s["end"])
                    evidence = {"provider": self.provider.provider, "reason": "public kline request",
                                "requested_start": cursor, "requested_end": stop, "checked_at": now(), "rule_version": "binance-rest-v1"}
                    succeeded = False
                    for attempt in range(max_attempts):
                        try:
                            calls += 1
                            raw, url, code = self.provider.page(symbol, timeframe, cursor, stop)
                            sha = hashlib.sha256(raw).hexdigest()
                            raw_path = self.store.root / "raw" / f"{sha}.json"
                            if not raw_path.exists():
                                temp = raw_path.with_suffix(f".{uuid.uuid4().hex}.tmp")
                                temp.write_bytes(raw)
                                os.replace(temp, raw_path)
                            evidence.update(url=url, http_status=code, response_sha256=sha,
                                            raw_path=str(raw_path.relative_to(self.store.root)))
                            bars = self.provider.parse(raw, step, cursor, stop, int(self.clock() * 1000))
                            self.store.publish(key, bars, evidence)
                            missing = set(range(cursor, stop, step)) - {c.time for c in bars}
                            for a, b in runs(missing, step):
                                self.store.mark(key, a, b, Status.MISSING if bars else Status.UNKNOWN,
                                                {**evidence, "reason": "absent from bounded response; no no-trades inference"},
                                                retry_count=s["retry_count"] + attempt + 1, next_retry_at=self.clock() + 60)
                            succeeded = True
                            break
                        except QualityError:
                            self.store.mark(key, cursor, stop, Status.CORRUPTED,
                                            {**evidence, "reason": "invalid or conflicting provider data"})
                            raise
                        except (httpx.HTTPError, OSError, ValueError) as exc:
                            evidence.update(reason="request failed", error=type(exc).__name__)
                            if attempt + 1 < max_attempts:
                                self.sleep(2 ** attempt)
                    if not succeeded:
                        self.store.mark(key, cursor, stop, Status.API_ERROR, evidence,
                                        retry_count=s["retry_count"] + max_attempts, next_retry_at=self.clock() + 60)
                        errors.append({"start": cursor, "end": stop, "error": evidence["error"]})
                    cursor = stop
            return {"series": key, "requests": calls, "errors": errors,
                    "coverage": self.store.coverage(key, start, end)}
