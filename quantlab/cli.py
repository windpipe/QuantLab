import argparse
import json
import os

from .backtest import END, START, STEP, run_baseline
from .binance import Collector
from .model import series
from .resample import resample
from .store import Store


def main():
    parser = argparse.ArgumentParser(description="QuantLab local market data (UTC epoch milliseconds)")
    parser.add_argument("--data-root", default=os.environ.get("QUANTLAB_DATA_ROOT", "E:/QuantLabData"))
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("collect", "coverage", "verify", "resample"):
        cmd = sub.add_parser(name)
        cmd.add_argument("--symbol", default="BTCUSDT")
        cmd.add_argument("--timeframe", default="5m")
        cmd.add_argument("--start", type=int, required=True)
        cmd.add_argument("--end", type=int, required=True)
        if name == "resample":
            cmd.add_argument("--target", required=True)
    baseline = sub.add_parser("baseline")
    baseline.add_argument("--collect", action="store_true")
    sub.add_parser("samsung-audit", help="Check real yfinance Samsung 5m coverage before any execution")
    sub.add_parser("portal-audit", help="Check Naver/Daum public Samsung data without execution")
    server = sub.add_parser("serve")
    server.add_argument("--port", type=int, default=8765)
    mark = sub.add_parser("mark", help="Record externally verified absence/error; never creates candles")
    mark.add_argument("--symbol", default="BTCUSDT")
    mark.add_argument("--timeframe", default="5m")
    mark.add_argument("--start", type=int, required=True)
    mark.add_argument("--end", type=int, required=True)
    mark.add_argument("--status", required=True)
    mark.add_argument("--evidence", required=True, help="JSON file with reason, authority, reference, version")
    args = parser.parse_args()
    if args.command == "serve":
        import uvicorn
        from .api import create_app
        uvicorn.run(create_app(args.data_root), host="127.0.0.1", port=args.port)
        return
    store = Store(args.data_root)
    if args.command == "portal-audit":
        from .samsung_audit import run_portals
        print(json.dumps(run_portals(store), indent=2))
    elif args.command == "samsung-audit":
        from .samsung_audit import run
        print(json.dumps(run(store), indent=2))
    elif args.command == "baseline":
        if args.collect:
            print(json.dumps(Collector(store).ensure("BTCUSDT", "5m", START - 60 * STEP, END)))
        folder, summary = run_baseline(store)
        print(json.dumps({"output": str(folder), "summary": summary}, default=str, indent=2))
    else:
        key = series(args.symbol, args.timeframe)
        if args.command == "collect":
            result = Collector(store).ensure(args.symbol, args.timeframe, args.start, args.end)
        elif args.command == "mark":
            from pathlib import Path
            evidence = json.loads(Path(args.evidence).read_text(encoding="utf-8-sig"))
            store.mark(key, args.start, args.end, args.status, evidence)
            result = store.coverage(key, args.start, args.end)
        elif args.command == "coverage":
            store.read(key)
            result = store.coverage(key, args.start, args.end)
        else:
            bars, manifest = store.strict(key, args.start, args.end)
            if args.command == "verify":
                result = {"valid": True, "rows": len(bars), "snapshot": manifest}
            else:
                result = store.publish(series(args.symbol, args.target), resample(bars, args.timeframe, args.target),
                                       {"reason": "complete UTC crypto aggregation", "parent_revision": manifest["revision"]},
                                       {"derived_from": manifest["revision"], "derived_series": key,
                                        "calendar": "crypto-utc-24x7-v1"})
        print(json.dumps(result, default=str, indent=2))


if __name__ == "__main__":
    main()
