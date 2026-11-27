"""Date-scoped Samsung minute-data feasibility audit. Never fabricates returns."""
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
import ast
import hashlib
import json

from .model import Candle, runs
from .store import digest, now

KST = timezone(timedelta(hours=9))
START = int(datetime(2026, 11, 1, tzinfo=KST).timestamp() * 1000)
END = int(datetime(2026, 11, 24, tzinfo=KST).timestamp() * 1000)
STEP = 300000
REFERENCES = [
    "https://global.krx.co.kr/contents/GLB/06/0602/0602010201/GLB0602010201T1.jsp",
    "https://www.truefriend.com/main/customer/notice/Notice.jsp?cmd=TF04ga000002&num=48007",
]


def reference_slots():
    """Explicit November-2026 reference, not a reusable KRX holiday calendar.

    Regular 09:00–15:30, November 19 CSAT 10:00–16:30. Slots during closing
    auction may have no trades; absence still needs evidence before execution.
    """
    out = []
    day = date(2026, 11, 1)
    while day < date(2026, 11, 24):
        if day.weekday() < 5:
            opening = 10 if day == date(2026, 11, 19) else 9
            start = datetime.combine(day, time(opening), tzinfo=KST)
            t = int(start.timestamp() * 1000)
            out.extend(range(t, t + 78 * STEP, STEP))
        day += timedelta(days=1)
    return out


def audit_rows(rows):
    expected = set(reference_slots())
    valid, invalid, duplicates = {}, [], []
    for row in rows:
        t = row["time"]
        if not START <= t < END:
            continue
        try:
            c = Candle(t, *(Decimal(str(row[name])) for name in ("open", "high", "low", "close", "volume")))
            c.validate(STEP)
            if t in valid:
                duplicates.append(t)
                if valid[t] != c:
                    raise ValueError("Conflicting duplicate")
            valid[t] = c
        except (ValueError, ArithmeticError):
            invalid.append(t)
    missing = expected - set(valid)
    return {"symbol": "005930.KS", "name": "Samsung Electronics", "currency": "KRW", "timeframe": "5m",
            "requested_start_kst": "2026-11-01T00:00:00+09:00", "requested_end_kst_exclusive": "2026-11-24T00:00:00+09:00",
            "expected_session_slots": len(expected), "valid_rows_in_reference_sessions": len(expected & set(valid)),
            "invalid_or_null_rows": len(invalid), "duplicate_rows": len(duplicates),
            "outside_reference_session_rows": len(set(valid) - expected), "unresolved_slots": len(missing),
            "unresolved_intervals_kst": [[datetime.fromtimestamp(a / 1000, KST).isoformat(), datetime.fromtimestamp(b / 1000, KST).isoformat()] for a, b in runs(missing, STEP)],
            "calendar_scope": "KRX November 2026 regular-session reference with CSAT exception; no automatic NO_TRADES inference",
            "references": REFERENCES,
            "backtest_status": "BLOCKED_INCOMPLETE_DATA" if missing or invalid or duplicates else "DATA_AUDIT_PASSED_ENGINE_NOT_RUN",
            "return_metrics": None}


def run(store):
    import yfinance as yf
    cache = store.root / "cache" / "yfinance"
    cache.mkdir(parents=True, exist_ok=True)
    yf.set_tz_cache_location(str(cache))
    frame = yf.download("005930.KS", start="2026-10-29", end="2026-11-24", interval="5m",
                        auto_adjust=False, repair=False, keepna=True, prepost=False,
                        threads=False, progress=False, multi_level_index=False, timeout=30)
    if frame is None or frame.empty:
        raise ValueError("yfinance returned no Samsung data; no returns calculated")
    path = store.root / "raw" / "samsung_yfinance_20261101_20261123_5m.parquet"
    frame.to_parquet(path, compression="zstd")
    rows = [{"time": int(index.timestamp() * 1000), **{name: row[name.title()] for name in ("open", "high", "low", "close", "volume")}} for index, row in frame.iterrows()]
    summary = audit_rows(rows)
    summary.update(provider="yfinance", provider_version=yf.__version__, auto_adjust=False, repair=False,
                   checked_at=now(), source_file=str(path), source_sha256=digest(path), downloaded_rows=len(frame),
                   requested_warmup_start="2026-10-29", timezone=str(frame.index.tz))
    folder = store.root / "backtest_results" / "samsung_001_data_audit"
    folder.mkdir(exist_ok=True)
    (folder / "audit.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


def naver_minute_quality(text):
    # Naver legacy response is a Python-like literal with null, not strict JSON.
    rows = ast.literal_eval(text.replace("null", "None").strip())[1:]
    stamps = sorted(str(r[0]) for r in rows)
    return {"rows": len(rows), "first_timestamp_kst": stamps[0] if stamps else None,
            "last_timestamp_kst": stamps[-1] if stamps else None,
            "rows_without_full_ohlc": sum(any(r[i] is None for i in (1, 2, 3, 4)) for r in rows),
            "volume_semantics": "provider header alone does not establish per-bar vs cumulative volume",
            "market_series": "not independently verified as KRX regular-session-only",
            "decision": "NOT_EXECUTION_READY: do not infer OHLC from minute closes"}


def run_portals(store):
    import httpx
    probes = [
        ("naver-minute", "https://api.finance.naver.com/siseJson.naver",
         {"symbol": "005930", "requestType": "1", "startTime": "20261101", "endTime": "20261123", "timeframe": "minute"}),
        ("daum-minute", "https://finance.daum.net/api/charts/A005930/5/minutes",
         {"limit": 200, "adjusted": "false", "to": "2026-11-24 00:00:00.0"}),
    ]
    result = {"checked_at": now(), "symbol": "005930", "return_metrics": None, "probes": []}
    with httpx.Client(timeout=25, follow_redirects=True) as client:
        for name, url, params in probes:
            r = client.get(url, params=params)
            sha = hashlib.sha256(r.content).hexdigest()
            path = store.root / "raw" / f"{name}_{sha}.txt"
            path.write_bytes(r.content)
            probe = {"provider": name, "url": str(r.url), "http_status": r.status_code,
                     "response_sha256": sha, "source_file": str(path)}
            if name == "naver-minute" and r.status_code == 200:
                probe.update(naver_minute_quality(r.text))
            elif r.status_code == 403:
                probe["decision"] = "ACCESS_DENIED: no bypass attempted; historical range unverified"
            else:
                probe["decision"] = "NOT_VERIFIED"
            result["probes"].append(probe)
    path = store.root / "backtest_results" / "samsung_001_data_audit" / "portals.json"
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result
