# P0 source and environment audit — 2026-11-24

Audited HEAD: 136ef9673f15d130ac734cd4beffc85fa15057e0, clean develop,
origin/develop identical after fetch. Upstream remote is Kernel-Hunter/kandle.
Source E:/Projects/QuantLab exists; E:/QuantLabData exists and was initially empty.
E: had approximately 690 GB free. Main has not been checked out or modified.

## Observed extension points

| Area | Verified source | Contract / implication |
|---|---|---|
| Provider | src/data/types.ts | Candle.time is UTC milliseconds; fetchCandles uses exclusive before and limit, ascending output |
| Registration | src/data/sources.ts | SOURCES array, first provider remains default; local flag bypasses symbol caching |
| Chart loader | src/data/live.ts | DataSource -> KLineCharts bars and subscription |
| CSV persistence | src/data/csv.ts | Browser localStorage, 2,500,000 chars/dataset, 4,000,000 chars total; independent store warranted |
| Resampling | src/data/timeframes.ts | Existing UI aggregation does not prove missing-bucket completeness |
| Replay | src/replay/{controller,session,loader}.ts | SwitchingLoader guards stale async callbacks by generation |
| Strategy | src/script/{lexer,parser,compiler,runtime,engine}.ts | Stateful bar-by-bar runtime; 1s default execution budget |
| Broker | src/script/strategy.ts | Pending market orders next open by default; no quantity rounding; explicit intrabar OHLC path assumption |
| Results | src/script/backtestJson.ts | Existing report serializer reusable; benchmark starts at first close, differs from Baseline #001 |
| Cross-series | src/data/feeds.ts, src/script/security.ts | MAX_FEED_BARS=5000; MAX_REQUESTS=5 |
| MCP | packages/mcp/src/{tools,server,bridge,security}.ts | Node server/loopback WebSocket bridge; keep original behavior |
| CI | .github/workflows/ci.yml | frozen install, test, build; Node 24 |

MIT LICENSE retains Copyright (c) 2026 Karim Masmoudi. Original README, UI,
dependencies and pnpm-lock.yaml remain intact.

## Real commands and outcomes

- Node v24.20.0 satisfies >=22.12; global pnpm 11.25.0 differs from pinned 12.11.2.
- Python 3.14.7 and 3.11.2 available; `.venv` created using `py -3.11 -m venv .venv`.
- Initial sandbox git/registry access denied; authorized elevated commands succeeded.
- Global pnpm auto-switch failed (missing executable); npm's pnpm 12 Windows shim
  also failed. Official `@pnpm/exe.win32-x64` 12.11.2 executed directly succeeds.
  Put that native binary directory first in the *process* PATH so nested pnpm works.
  This is an environment workaround; no dependency or lockfile downgrade.
- `pnpm install --frozen-lockfile` using native 12.11.2: exit 0, 148 packages.
- Unchanged upstream `pnpm test`: **41 files, 649 tests passed**, exit 0, 8.54s.
- First `pnpm build`: TypeScript + Vite succeeded; nested global pnpm failed.
  Repeated with native pnpm first in PATH: **entire build including MCP passed**, exit 0.
- Vite emits an existing future native-config-loader import-extension warning.
- `pnpm dev --host 127.0.0.1`: started at http://127.0.0.1:5173/.
  Browser observed live BTCUSDT 1H candlesticks, volume, EMA overlays and drawing toolbar.

## P1 implementation contract

UTC half-open ranges and final real candles; Decimal prices/volume serialized
losslessly into Parquet strings, numerical conversion only at chart boundary.
Full-series immutable snapshots are a deliberately small first implementation;
monthly partition compaction/query pushdown remains follow-up for large histories.
Single OS writer lock, verified temporary Parquet -> atomic rename -> DuckDB
transaction publishes head, manifest and VALID evidence. Crash may leave orphan
files, never a partial published snapshot; no automatic snapshot deletion.

Coverage is a versioned interval event journal; latest overlay supplies disjoint
intervals, unrecorded range UNKNOWN. A normal-gap claim needs authority/reference/
version; no automatic KRX/Upbit classifications are claimed. Conflicts fail closed.
Hash every referenced snapshot before reuse. Strict reference engine requires
continuous real warm-up and execution bars. Explicit old snapshots remain readable.

Provider errors retain retry count/cooldown; raw successful HTTP payloads retained
by SHA-256. Empty bounded response UNKNOWN; partial missing slots MISSING.
Binance REST first; archive/other providers, correction recovery, scalable catalog
queries and real-market calendar reconciliation remain separate roadmap work.
