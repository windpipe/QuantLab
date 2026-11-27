# Market engine 0.1 — local runbook

This is an initial reviewed increment, not the entire ROADMAP. No live trading.
Original Kandle UI, MIT license and provider defaults remain available.

## Setup (PowerShell from E:/Projects/QuantLab)

```powershell
py -3.11 -m venv .venv
.venv/Scripts/python -m pip install -r requirements.lock.txt
.venv/Scripts/python -m pip install --no-deps -e .
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

Use pnpm **12.11.2**. If the global Windows auto-switch/shim is broken, install
the official native package into an ignored local tool directory and prepend it
to the process PATH (does not change system settings or project dependencies):

```powershell
npm install --prefix .tools/pnpm --no-audit --no-fund --package-lock=false pnpm@12.11.2
$quantlabPnpmBin = Join-Path (Get-Location) '.tools/pnpm/node_modules/@pnpm/exe.win32-x64'
$env:PATH = "$quantlabPnpmBin;$env:PATH"
pnpm --version
```

## Collect, inspect, execute

All command ranges are aligned, half-open UTC epoch milliseconds. Data root can
be changed with `--data-root` or `QUANTLAB_DATA_ROOT`. Services bind 127.0.0.1.

```powershell
.venv/Scripts/python -m quantlab.cli --data-root E:/QuantLabData baseline --collect
.venv/Scripts/python -m quantlab.cli --data-root E:/QuantLabData coverage --symbol BTCUSDT --timeframe 5m --start 1793440800000 --end 1795446000000
.venv/Scripts/python -m quantlab.cli --data-root E:/QuantLabData verify --symbol BTCUSDT --timeframe 5m --start 1793440800000 --end 1795446000000
.venv/Scripts/python -m quantlab.cli --data-root E:/QuantLabData serve
```

In another terminal run `pnpm dev --host 127.0.0.1`, open http://127.0.0.1:5173/,
click symbol search -> **QuantLab local** -> BTCUSDT. The stored 5m snapshot is
static and needs no Binance network connection. Open the bottom **백테스트 결과 ·
SMA 5/20/60** panel for the full requested interval's saved performance, equity
and all fills. The panel verifies data and artifact hashes. It never recalculates
returns from the chart viewport. Results exist only after the baseline command.

Blue BUY and pink SELL labels anchor to **actual next-open fill times and prices**,
not signal closes. Only loaded matching snapshot bars are marked. Older page loads
refresh marks. Marks are separate from editable drawings and disappear on another
symbol/source/timeframe. Full-period results and baseline marks hide in Replay to
avoid revealing future outcomes. No actual trading orders are sent.

The original default EMA 20/50/200 is unrelated to the reference strategy. Use
Indicators -> MA (Moving Average) -> lengths **5,20,60** for simple moving averages;
KLineCharts' indicator named SMA means *Smoothed* Moving Average. The current
local browser was configured to MA(5,20,60), retaining its volume pane.

Additional commands: `collect`, `coverage`, `verify`, `resample`, `mark`, `serve`.
`resample --timeframe 1m --target 5m --start ... --end ...` requires complete
UTC 24/7 crypto buckets. Derived heads reject stale source revisions; explicit
old snapshots remain reproducible. Regeneration publishes a new snapshot of the
requested derived range, never mixes buckets from different source revisions.

`mark --status TRADING_HALTED --evidence <local-json-file> ...` stores a claim with
`reason`, `authority`, `reference`, `version`. Also supports documented normal-gap
states; it creates no OHLCV. Do not use generic empty responses as evidence.
The initial release accepts externally verified evidence; it does not independently
authenticate announcements or implement KRX schedules/instrument histories.

## API

- GET `/health`, `/symbols`
- GET `/candles?symbol=BTCUSDT&timeframe=5m&limit=500&before=<exclusive-ms>`
- GET `/candles?...&revision=<immutable-revision>` pins paging/backtest inputs
- GET `/coverage?symbol=BTCUSDT&timeframe=5m&start=...&end=...`
- GET `/backtests/baseline-001` reads saved summary/equity/trades after hash checks

API is read-only. CORS permits the standard localhost/127.0.0.1 Vite ports 5173
and 4173 only. No credentials or external bind switch. Missing data is HTTP 409,
not silently converted into exhausted history or substitute exchange data.

## Verification

```powershell
New-Item -ItemType Directory -Force .test-tmp | Out-Null
.venv/Scripts/python -m pytest -q --basetemp .test-tmp/unique-run-name
$env:QUANTLAB_BASELINE_DIR = 'E:/QuantLabData/backtest_results/baseline_001_f666fe998fb14aaea8370c9b00bcf488'
pnpm test
pnpm build
```

Use a fresh basetemp child for sandbox runs; the usual user TEMP directory was
inaccessible here. Without the environment variable, the real-data parity test
is explicitly skipped. With it, API must be running and compares 117 fills,
fees, final equity, MDD and all 6,624 equity points against existing Kandle.
Kandle's percent sizing excludes fees, so reserve 1/(1+.001) of equity to match
the reference cash-inclusive fee policy. Its built-in benchmark is different.

Known limits: full-series files and Python range filtering are small-data bootstrap
choices; monthly partition compaction and DuckDB predicate pushdown are pending.
Corrupted/conflicting originals stop collection and execution; automated repair
and correction approval/version workflow are pending. Empty/partial responses
remain UNKNOWN/MISSING with cooldown. Per-call retries are bounded to three.
No archive, CCXT, KRX, Upbit, calendar automation, generalized strategy editor,
Data Manager coverage UI, portfolio/optimizer or pattern research is claimed done.
