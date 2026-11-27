# Project state

Updated 2026-11-27. Repository: https://github.com/windpipe/QuantLab ; integration branch develop.
Phase: P0 verified; initial independent market engine and interactive BTC backtesting implemented locally, integration review pending. Design baseline commit 8961b5cc171c2996618ba573cb923e61c371b407.
Completed: upstream 649 tests/build/browser audit; Python 3.11 environment; immutable Parquet snapshots, DuckDB catalog, interval evidence/retry journal, Binance REST collection, strict validation, complete crypto resampling, read-only loopback API and Kandle adapter. Not a production-complete Coverage Map or entire ROADMAP.
Baseline #001 measured on 6,684 actual bars: final equity 7,814.337042 USDT, net return -21.856630%, MDD 25.480357%, 58 closed trades. Same snapshot agrees with Kandle on fills, fees and every execution equity point.
UI: QuantLab name, real BUY/SELL marks, KST/USDT equity axes/grid/crosshair, zoom/pan/reset, optional equity fill markers, no-code strategy settings and CPU execution over the requested snapshot interval. Original editor remains a separate loaded-chart engine; Pine compatibility expansion deferred by user.
Trailing-year BTC 5m run completed: 2025-11-24 through 2026-11-23 KST, 105,120 execution bars plus 60 warm-up, zero missing slots. SMA final 914.588893 USDT (-90.854111%); Double B experimental final 2,985.723597 USDT (-70.142764%). SMA fills and every equity point match the independent Decimal reference. Double B is our mechanical hypothesis, not the author's complete discretionary system. KRX work deferred by user.
Direct URL entry now shows the BTC research panel expanded regardless of the main chart provider; it automatically loads saved annual results. Browser layout storage is separate between browsers and localhost/127.0.0.1 origins. Replay still hides completed results. Latest visual browser verification pending because Computer Use stopped on URL-policy detection.
Latest checks before direct-entry visibility change: JS 662 passed including real annual/November parity; Python 16 passed (one Starlette deprecation warning); TypeScript, Vite and MCP builds passed. See WORKLOG for subsequent verification.
See NEXT_TASK.md and ROADMAP.md. Update this state with actual results after every work session.
Replay now opens a KST date/time and speed dialog from the existing toolbar button, with optional chart-click selection. Speeds 0.25/0.5/1/2/3/5/10/20× (1× = one bar/second), play/pause/step, and KST progress. QuantLab history paging supports up to 200,000 bars instead of the old 10,000-bar reach. Latest replay checks: 662 JS tests passed, 3 optional real-data tests skipped; TS and Vite build passed. Latest UI visual verification remains pending.

## Codex local handoff

Replay position visibility: added a chart-corner card showing current candle open
time in KST, playing/paused/completed state, start/end, elapsed/total bars and a
progress bar. Follow-current is enabled by default; a current-bar button returns
the viewport after manual panning. Replay tests (15), TypeScript and Vite passed;
visual verification remains pending.
Verified source E:/Projects/QuantLab and external data E:/QuantLabData. Feature branch codex/bootstrap-market-engine, branched from clean develop at 136ef9673f15d130ac734cd4beffc85fa15057e0. P0 audit commit f1a9572. Main unchanged. Implementation commits c91bf53 (data engine) and 3b338e9 (UI/replay); publication status recorded below. See ENGINE_RUNBOOK.md and BASELINE_AUDIT.md.

## 2026-11-27 publication checkpoint
Validated before publication: JS 662 passed, 3 optional real-data tests skipped; Python 16 passed with one Starlette deprecation warning; TypeScript, Vite and MCP builds passed. No new actual-data backtest run performed today. Browser visual checks remain pending. Publish branch codex/bootstrap-market-engine, keep main/develop unchanged until PR review. Market datasets/results stay external.

2026-11-27 publication verified: origin/codex/bootstrap-market-engine contains c91bf53, 3b338e9 and 9de9430. Review PR #1 (draft): https://github.com/windpipe/QuantLab/pull/1. Not merged. Remote main remains 02eb2bc and develop 136ef96. Final documentation follow-up is pushed on the same branch.
