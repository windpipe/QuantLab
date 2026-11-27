# Work log

## 2026-11-24 — Planning and repository setup
- Public fork from Kernel-Hunter/kandle, renamed windpipe/QuantLab.
- Created develop from main.
- Recorded seven planning documents and Mermaid diagrams in docs/windpipe, commit 8961b5cc171c2996618ba573cb923e61c371b407.
- Added session handoff instructions and next task P0.
- Verified GitHub write access and successful design ref update.
- Build/test: not run. Implementation: not started.
- Open issues: upstream audit, actual provider capabilities, coverage schema and storage transaction implementation.

## 2026-11-24 — Local implementation checkpoint
- Branch codex/bootstrap-market-engine from clean develop 136ef967. P0 audit
  committed as f1a9572; remaining local feature commits/PR pending active work.
- All thirteen windpipe Markdown documents and Mermaid diagrams reviewed.
- Node 24.20.0; official native pnpm 12.11.2 workaround for broken Windows global
  shim; frozen install succeeded without changing pnpm lockfile/dependencies.
- Original suite: 41 files / 649 tests passed; full TS/Vite/MCP build passed.
  Browser verified original chart. Python 3.11.2 .venv installed pinned dependencies.
- Added independent store, coverage journal/evidence, Binance collector, resampling,
  read-only FastAPI, CLI, strict Decimal reference engine and DataSource consumer.
- Actual Binance BTC 5m baseline: 7 HTTP pages, 6,684 validated bars including
  60 warm-up; no missing/duplicate/invalid/synthetic rows. Snapshot
  f666fe998fb14aaea8370c9b00bcf488; SHA-256
  174b63684e420566e55b07636bb036c8e9fe9203b3fb1c535427a196fabc3b6e.
  Repeat request made zero downloads (0.263s measured reuse check).
- Final equity 7,814.337042 USDT; -21.856630%; MDD 25.480357%; 58 completed trades;
  win rate 15.517241%; PF 0.229889; buy/hold -18.862966%; fees 1,057.038411 USDT.
  Raw/Parquet/results outside Git under E:/QuantLabData.
- Actual full-snapshot parity with existing Kandle: 117 fills, all 6,624 equity
  points, fees and summary matched. Kandle needs 100/(1+.001)% sizing to include
  entry fees in cash budget. No forced final liquidation; fractional Decimal sizing.
- UI verified QuantLab branding, MA(5,20,60), actual BUY/SELL labels, performance
  pane, KST time/value axes, grid, crosshair, zoom/reset, equity marker toggle.
- Python tests found and fixed a real Windows Arrow temporary-file mapped-handle
  rename failure by verifying buffer-backed Parquet before atomic publication.
- Full JS checkpoint 656 tests passed; Python checkpoint 15 tests passed (one
  Starlette/httpx deprecation warning). Latest Double B subset 3 passed. Final
  full validation must be recorded after annual-run/UI work completes.
- Samsung feasibility audits requested then explicitly deferred by user: yfinance
  1.8.0 returned 1,133 valid in-session rows vs 1,248 expected slots, 115 unresolved;
  no returns produced. Naver minute probe 3,757 rows, all missing full OHLC and
  only Nov16–23; Daum HTTP403. Evidence hashes/files external. No access bypass.
- Pine expansion explicitly deferred. Existing language is a subset, not full
  Pine v5/v6 compatibility. AI Agent bridge was not used/enabled for this work.
- User requested Double B research. Retrieved author video's public Korean auto
  captions (K3hrW4jEEnw), distinguished two-band setup from discretionary decisions.
  Independently authored mechanical spot experiment, not official author code:
  20/2 close + 4/4 open, optional close reentry, SMA20/upper-touch/close-stop exit,
  next-open fills. Actual Nov experiment: 9,161.456229 USDT, -8.385438%, MDD
  10.315268%, 47 closed trades; result is specific to our stated assumptions.
- Active: BTC 2026 annual interval/timeframe confirmation, data and experiments.

## Entry template
Date / branch / goal; changes and files; commands and actual results; commit/PR; decisions; blockers; next task. Never report unexecuted tests as passed.

## 2026-11-25 — Replay current position visibility
- User could not identify replay cursor. Added a prominent chart-corner card with
  current candle open time (KST), play/pause/completed state, chosen start, loaded
  end, elapsed/total playback bars, percent and progress bar. Counts exclude
  historical bars already visible before the chosen start; range ends at the
  latest loaded candle, not assumed live time.
- Follow-current enabled by default; each revealed bar scrolls to the replay edge.
  Optional toggle permits inspecting history, and current-bar button returns to
  that edge. Full future bars remain withheld by the existing loader.
- TypeScript passed, replay suite 15 passed, Vite build passed. Progress assertions
  cover 0%, intermediate and 100%. Visual browser checks still pending.
- Branch codex/bootstrap-market-engine; changes local, commit/PR pending; main
  unchanged. Next: visual position/follow/panning check and staged review commits.

## 2026-11-25 — Replay time entry and speed controls
- Extended upstream Replay instead of adding a second player. Existing topbar
  Replay button now opens a KST datetime/speed dialog, with the chart-click picker
  preserved. Playback controls also allow changing the starting time.
- Added 0.25/0.5/1/2/3/5/10/20×, explicitly one bar per second at 1×; KST progress,
  pause/play, single-step, keyboard shortcuts retained. No intrabar tick playback.
- Added bounded QuantLab paging (10,000/page, up to 200,000 total) so a year of
  stored 5m history can be selected; remote provider paging remains bounded to
  ten 1,000-bar requests. Empty history fails to cover the requested start rather
  than manufacturing bars. Reject duplicate/stalled cursors; cancel stale starts
  on changed context/new requests, dialog cancellation or replay stop.
- Future bars remain withheld by ReplaySession/SwitchingLoader; completed research
  panel and fill overlays stay hidden during Replay. No live orders are submitted.
- Checks: TypeScript passed; vitest full suite 662 passed / 3 opt-in real-data
  tests skipped; Vite build passed. Added KST/calendar, slow/fast speeds, annual
  paging and overlap/empty-response checks; existing replay future isolation tests
  passed. Visual checks still pending; previous Computer Use URL-policy stop.
- Branch codex/bootstrap-market-engine; replay and earlier changes remain local,
  feature commits/PR to develop pending. Main untouched.

## 2026-11-25 — Annual results and direct-entry visibility
- User confirmed trailing 12 months 2025-11-24 through 2026-11-23 KST, BTCUSDT
  spot 5m, Double B experimental vs SMA. Collected 99 additional Binance pages
  in 117.018 seconds, reusing existing data. Validated 105,180 rows including 60
  warm-up; zero missing slots. Snapshot 67876e9deab04608b96f2f9793cb2df2,
  Parquet SHA e0ad24ef92c49735c28f1d641158e8e2c34a0ec360538bdfe05d0c0b54f03619.
- SMA: final 914.588893 USDT, -90.854111%, MDD 91.600346%, 960 closed trades.
  Double B hypothesis: final 2,985.723597 USDT, -70.142764%, MDD 70.891093%,
  614 closed trades. Comparable buy/hold -27.401022%. Initial 10,000 USDT,
  .1% each-side fee, next-open fills; no forced final liquidation.
- Added independent annual Decimal reference, paginated pinned research loading,
  isolated CPU Worker and saved result API with checksum/snapshot verification.
  Corrected research net return to include open-position valuation. Annual test
  checks all SMA fills and 105,120 equity points against Python.
- Results/provenance outside Git: E:/QuantLabData/backtest_results/btc_12m_20251124_20261123.
  Reproduce: python -m quantlab.annual E:/QuantLabData, then with local API running,
  set QUANTLAB_ANNUAL_DIR to that folder and run vitest tests/annual-research.test.ts.
- Saved annual SMA/Double B buttons are connected in the UI. Direct browser entry
  previously hid the entire panel unless browser-local layout source was quantlab;
  changed visibility to depend only on Replay and default-expanded automatic load.
  Main chart source is preserved; panel explicitly identifies BTC/USDT 5m.
- Before visibility fix: JS 662 passed including all three opt-in real-data tests;
  Python 16 passed, one Starlette/httpx deprecation warning; TS/Vite/MCP passed.
  After visibility fix: node node_modules/typescript/bin/tsc --noEmit passed;
  node node_modules/vitest/vitest.mjs run: 659 passed, 3 optional data tests skipped;
  node node_modules/vite/bin/vite.js build passed. Existing Vite native-config
  warning remains. Browser visual verification pending: Computer Use stopped
  because current browser URL could not be determined reliably for policy checks.
- Feature remains on codex/bootstrap-market-engine; only P0 commit f1a9572 is
  published locally. Remaining changes/PR pending. Main untouched. Next: visual
  direct-entry verification and reviewable commits/PR to develop, then hardening.

## 2026-11-24 — Codex continuation
- User selected E: for local development. Suggested paths E:/Projects/QuantLab and E:/QuantLabData.
- BTC triple SMA baseline agreed; actual exchange-data run pending, no measured returns.
- Added local setup and baseline contracts. Local files and environment not verified from chat.

## 2026-11-27 — Commit/push preparation and cross-computer audit
- User requested GitHub commit/push, then asked to check Double B work from another computer. Fetched origin: main 02eb2bc and develop 136ef96 only; PR search returned none. No separate published Double B work found. Relevant chat reviewed (백테스트 데이터수집 방법) contains initial planning, not another measured Double B implementation. Other machine local filesystem is unavailable; asked user for repo/branch/chat identification.
- Validated today: node node_modules/typescript/bin/tsc --noEmit; full Vitest 662 passed / 3 optional real-data tests skipped; Vite build and MCP tsc passed. Python pytest 16 passed, one existing Starlette/httpx deprecation warning, using --basetemp .test-tmp/publish-20261127. Vite native-config warning remains. No fresh market collection/backtest or browser UI verification claimed.
- Commit c91bf53: independent market store/collector/reference/API/tests/CI. Commit 3b338e9: QuantLab adapter, actual report UI, strategies and Replay improvements. Documentation checkpoint committed separately. Secret-pattern scan found no matches; staged files contain source/test/docs only, no market data, .env, tokens or binary artifacts. Main and develop untouched.
- Next: publish feature branch and open review PR; record actual remote verification and PR URL afterward. Broader coverage/calendar/repair/query-scaling and visual verification remain follow-ups, KRX/Pine expansion deferred.

2026-11-27 publication verified: origin/codex/bootstrap-market-engine contains c91bf53, 3b338e9 and 9de9430. Review PR #1 (draft): https://github.com/windpipe/QuantLab/pull/1. Not merged. Remote main remains 02eb2bc and develop 136ef96. Final documentation follow-up is pushed on the same branch.
