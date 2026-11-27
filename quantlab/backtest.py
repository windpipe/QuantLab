"""Decimal CPU reference, close signals then next-open fills; no live execution."""
import csv
import hashlib
from importlib.metadata import version
from pathlib import Path
from decimal import Decimal, localcontext
import json

from .model import interval
from .store import QualityError, now


START = 1793458800000  # 2026-11-01 00:00 KST
END = 1795446000000    # 2026-11-24 00:00 KST
STEP = 300_000
VERSION = "sma-5-20-60-next-open-v1"


def simulate(bars, start, end, step=STEP, capital=Decimal("10000"), fee=Decimal("0.001")):
    if step <= 0 or end <= start or (end - start) % step:
        raise ValueError("Invalid execution interval")
    if capital <= 0 or fee < 0 or fee >= 1:
        raise ValueError("Invalid capital/fee")
    if len(bars) < 61 or bars[0].time != start - 60 * step or bars[-1].time != end - step:
        raise QualityError("Require exactly 60 pre-start warm-up bars and full execution range")
    for i, c in enumerate(bars):
        c.validate(step)
        if c.time != bars[0].time + i * step:
            raise QualityError("Discontinuous execution/warm-up candles")
    with localcontext() as ctx:
        ctx.prec = 38
        cash, qty, pending = capital, Decimal(0), None
        trades, equity, closed = [], [], []
        entry_cost = None
        closes = []
        peak, mdd = capital, Decimal(0)
        for c in bars:
            active = start <= c.time < end
            if active and pending:
                side, signal_time = pending
                if side == "BUY":
                    qty = cash / (c.open * (1 + fee))
                    value = qty * c.open
                    commission = value * fee
                    entry_cost = cash
                    cash = Decimal(0)
                    filled = qty
                else:
                    filled = qty
                    value = qty * c.open
                    commission = value * fee
                    cash = value - commission
                    qty = Decimal(0)
                    closed.append(cash - entry_cost)
                    entry_cost = None
                trades.append({"signal_time": signal_time, "fill_time": c.time, "side": side,
                               "price": c.open, "quantity": filled, "fee": commission, "cash_after": cash})
                pending = None
            closes.append(c.close)
            if not active:
                continue
            value = cash + qty * c.close
            peak = max(peak, value)
            mdd = max(mdd, (peak - value) / peak)
            equity.append({"time": c.time, "equity": value, "cash": cash, "quantity": qty})
            if len(closes) >= 60:
                fast, mid, slow = (sum(closes[-n:]) / n for n in (5, 20, 60))
                if not qty and fast > mid > slow:
                    pending = ("BUY", c.time)
                elif qty and fast < mid < slow:
                    pending = ("SELL", c.time)
        wins = [p for p in closed if p > 0]
        losses = [p for p in closed if p < 0]
        first = next(c for c in bars if c.time >= start)
        benchmark_qty = capital / (first.open * (1 + fee))
        summary = {"strategy_version": VERSION, "start_utc_ms": start, "end_utc_ms": end,
                   "execution_bars": len(equity), "warmup_bars": 60, "initial_capital": capital,
                   "fee_fraction_per_side": fee, "slippage": 0,
                   "quantity_policy": "38-digit Decimal fractional quantity; no exchange lot rounding; fees paid in USDT",
                   "end_policy": "mark at final close, no forced liquidation; pending last signal discarded",
                   "final_equity": equity[-1]["equity"], "net_return_pct": (equity[-1]["equity"] / capital - 1) * 100,
                   "max_drawdown_pct": mdd * 100, "completed_trades": len(closed),
                   "win_rate_pct": Decimal(len(wins)) / len(closed) * 100 if closed else None,
                   "profit_factor": sum(wins) / -sum(losses) if losses else None,
                   "fees_paid": sum(t["fee"] for t in trades), "open_quantity": qty,
                   "buy_and_hold_return_pct": (benchmark_qty * bars[-1].close / capital - 1) * 100,
                   "buy_and_hold_policy": "buy first execution open, same entry fee and quantity policy; final-close valuation"}
        return summary, trades, equity


def run_baseline(store):
    key = "binance:spot:BTCUSDT:5m:raw"
    interval(START, END, "5m")
    bars, manifest = store.strict(key, START - 60 * STEP, END)
    summary, trades, equity = simulate(bars, START, END)
    summary.update(snapshot=manifest, measured_at=now(), engine="quantlab-reference-0.1.0", device="cpu")
    summary.update(coverage=store.coverage(key, START - 60 * STEP, END),
                   integrity={"expected_rows": 6684, "actual_rows": len(bars), "missing_slots": 0,
                              "duplicate_timestamps": 0, "invalid_ohlcv": 0, "synthetic_rows": 0,
                              "snapshot_sha256_verified": True},
                   code_sha256={p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                                for p in Path(__file__).parent.glob("*.py")},
                   dependencies={name: version(name) for name in ("duckdb", "pyarrow", "fastapi")})
    folder = store.root / "backtest_results" / ("baseline_001_" + manifest["revision"])
    folder.mkdir(exist_ok=True)
    for name, rows, fields in (("trades", trades, ["signal_time", "fill_time", "side", "price", "quantity", "fee", "cash_after"]),
                               ("equity", equity, ["time", "equity", "cash", "quantity"])):
        with (folder / f"{name}.csv").open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)
    summary["artifact_sha256"] = {name: hashlib.sha256((folder / name).read_bytes()).hexdigest()
                                  for name in ("trades.csv", "equity.csv")}
    (folder / "summary.json").write_text(json.dumps(summary, default=str, indent=2, allow_nan=False), encoding="utf-8")
    return folder, summary
