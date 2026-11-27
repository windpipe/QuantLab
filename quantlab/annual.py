"""Reproduce the agreed trailing-year SMA reference against the pinned audit."""
import csv
import hashlib
import json
from pathlib import Path
import sys

from .backtest import simulate
from .store import Store, now


def run(root):
    store = Store(root)
    folder = Path(root) / 'backtest_results/btc_12m_20251124_20261123'
    audit = json.loads((folder / 'data.json').read_text())
    start, end = audit['start_utc_ms'], audit['end_utc_ms']
    bars, snapshot = store.strict('binance:spot:BTCUSDT:5m:raw', start - 60 * 300000,
                                  end, audit['snapshot']['revision'])
    summary, trades, equity = simulate(bars, start, end)
    summary.update(snapshot=snapshot, measured_at=now(), integrity=audit,
                   source_sha256=hashlib.sha256(Path(__file__).with_name('backtest.py').read_bytes()).hexdigest())
    for name, rows in [('trades', trades), ('equity', equity)]:
        with (folder / f'sma_{name}.csv').open('w', newline='', encoding='utf-8') as stream:
            writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
    summary['artifact_sha256'] = {f'sma_{name}.csv': hashlib.sha256((folder / f'sma_{name}.csv').read_bytes()).hexdigest()
                                  for name in ('trades', 'equity')}
    (folder / 'sma_reference.json').write_text(json.dumps(summary, default=str, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in summary.items() if k not in ('snapshot', 'integrity')}, default=str, indent=2))


if __name__ == '__main__':
    run(sys.argv[1] if len(sys.argv) > 1 else 'E:/QuantLabData')
