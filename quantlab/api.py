"""Read-only, loopback default HTTP API. Collection is an explicit CLI operation."""
import os
import csv
import json

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .model import TIMEFRAMES, series
from .store import QualityError, Store, digest


def create_app(root=None):
    app = FastAPI(title="QuantLab Market Data", version="0.1.0")
    app.add_middleware(CORSMiddleware,
                       allow_origins=["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:4173", "http://localhost:4173"],
                       allow_methods=["GET"], allow_headers=[])

    def store():
        return Store(root or os.environ.get("QUANTLAB_DATA_ROOT", "E:/QuantLabData"))

    @app.get("/health")
    def health():
        return {"status": "ok", "device": "cpu"}

    @app.get("/symbols")
    def symbols():
        grouped = {}
        for key in store().symbols():
            _, _, symbol, tf, _ = key.split(":")
            grouped.setdefault(symbol, []).append(tf)
        return [{"symbol": symbol, "base": symbol[:-4] if symbol.endswith("USDT") else symbol,
                 "quote": "USDT" if symbol.endswith("USDT") else "", "pricePrecision": 8,
                 "volumePrecision": 8, "market": "crypto", "exchange": "Binance spot",
                 "timeframes": sorted(tfs)} for symbol, tfs in grouped.items()]

    @app.get("/candles")
    def candles(symbol: str, timeframe: str, before: int | None = None,
                limit: int = Query(500, ge=1, le=10000), start: int | None = None,
                end: int | None = None, revision: str | None = None):
        try:
            key = series(symbol, timeframe)
            s = store()
            bars, manifest = s.read(key, revision)
            if not manifest:
                raise QualityError("No stored snapshot for requested symbol/timeframe")
            selected = [c for c in bars if (before is None or c.time < before)
                        and (start is None or c.time >= start) and (end is None or c.time + TIMEFRAMES[timeframe] <= end)]
            selected = selected[-limit:]
            if selected:
                # Never return a silently shortened or gapped chart page.
                s.strict(key, selected[0].time, selected[-1].time + TIMEFRAMES[timeframe], revision)
            return {"candles": [c.chart() for c in selected], "snapshot": manifest,
                    "exhausted": not selected or selected[0].time == bars[0].time}
        except (ValueError, KeyError) as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.get("/coverage")
    def coverage(symbol: str, timeframe: str, start: int, end: int):
        try:
            s = store()
            key = series(symbol, timeframe)
            s.read(key)
            return {"series": key, "intervals": s.coverage(key, start, end)}
        except (ValueError, KeyError) as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.get("/backtests/baseline-001")
    def baseline_result():
        s = store()
        reports = list((s.root / "backtest_results").glob("baseline_001_*/summary.json"))
        if not reports:
            raise HTTPException(404, "Baseline #001 has not been run. Run: python -m quantlab.cli baseline --collect")
        path = max(reports, key=lambda p: p.stat().st_mtime_ns)
        try:
            summary = json.loads(path.read_text(encoding="utf-8"))
            snapshot = summary["snapshot"]
            s.strict(snapshot["series"], summary["start_utc_ms"] - 60 * 300_000,
                     summary["end_utc_ms"], snapshot["revision"])
            output = {"summary": summary}
            for name in ("equity", "trades"):
                file = path.parent / f"{name}.csv"
                if digest(file) != summary["artifact_sha256"][file.name]:
                    raise QualityError("Backtest artifact checksum mismatch; rerun baseline")
                with file.open(encoding="utf-8", newline="") as f:
                    output[name] = list(csv.DictReader(f))
            return output
        except (ValueError, KeyError, OSError) as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.get("/backtests/btc-12m")
    def annual_result(strategy: str = "double-b"):
        if strategy not in ("sma", "double-b"):
            raise HTTPException(422, "Unknown research strategy")
        s = store()
        folder = s.root / "backtest_results/btc_12m_20251124_20261123"
        path = folder / f"{strategy}_report.json"
        if not path.exists():
            raise HTTPException(404, "Annual research result has not been generated")
        try:
            if digest(path) != (folder / f"{strategy}_report.sha256").read_text().strip():
                raise QualityError("Annual report checksum mismatch")
            report = json.loads(path.read_text(encoding="utf-8"))
            summary = report["summary"]
            snapshot = summary["snapshot"]
            s.strict("binance:spot:BTCUSDT:5m:raw", summary["start_utc_ms"] - 60 * 300000,
                     summary["end_utc_ms"], snapshot["revision"])
            summary["output_kind"] = "saved-research"
            return report
        except (ValueError, KeyError, OSError) as exc:
            raise HTTPException(409, str(exc)) from exc

    return app


app = create_app()
