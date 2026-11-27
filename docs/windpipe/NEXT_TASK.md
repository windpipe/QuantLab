# Active task — BTC annual research run, then review and hardening

Updated 2026-11-27 publication checkpoint. P0 steps below are historical and completed.

1. Annual run completed for the user-selected trailing year 2025-11-24 through
   2026-11-23 KST, BTC spot 5m. Saved reports and source snapshot live outside Git
   at E:/QuantLabData/backtest_results/btc_12m_20251124_20261123. Verify direct-entry
   UI visibility in a fresh browser when browser automation is available again.
   Also visually verify Replay date selection, 0.25–20× playback, pause/step,
   context-change cancellation and return from replay. Pure regression checks pass.
   Include the new current-KST/progress card, follow-current toggle and current-bar
   return button in visual verification after panning away from the replay cursor.
2. Keep Double B bands separate from discretionary decision-making. Clearly label
   any automated entry/exit model as a QuantLab experiment. Provide a no-code
   selector and plain-language settings; broad Pine expansion is deferred.
3. Complete full JS/Python/build/browser checks after active changes, update measured
   results, commit staged increments and open review PR to develop; do not merge
   without review. Main remains upstream-only.
4. Next production tasks: catalog range-query scaling/partition compaction,
   explicit correction/repair workflow, retry/rate-limit hardening, provider and
   calendar automation, real Data Manager coverage UI, richer research engine.

User explicitly deferred KRX collection. Preserve Samsung audit evidence without
reporting returns: yfinance had 115 unresolved expected session slots; inspected
Naver legacy minute response had no full OHLC; Daum probe HTTP 403. Do not continue
KRX work until requested. KIS/Kiwoom documented candidates, not integrated or tested.

## Historical P0 acceptance plan

1. Fetch origin develop and inspect status, HEAD, upstream relationship, package manifests, lockfiles and documented commands.
2. Create feature/bootstrap-audit from develop (if not already present). Do not change main.
3. Inspect existing Kandle DataSource, CSV storage, Replay, strategy runtime, backtest and MCP entry points. Record real file paths, interfaces and reusable components.
4. Install dependencies using the documented package manager and pinned requirements; run the existing tests and build. Record commands, versions, exit status, failures and blockers. Do not silently change upstream dependencies to make tests pass.
5. Add baseline audit documentation and propose P1 implementation contracts: normalized candle schema, provider capability contract, interval coverage/evidence schema, manifest and atomic storage rules.
6. Update PROJECT_STATE, WORKLOG and NEXT_TASK with actual completion status, commit/PR, and the next actionable work. P1 begins after baseline findings are recorded; distinguish observed facts from proposals.

Acceptance: reproducible baseline commands and results, verified source map, identified extension points, no unintended upstream modifications. If environment cannot run tests, report not run and explain why.

## First local acceptance scenario
Verify E: paths with user, perform P0 audit, and run Baseline #001 against actual Binance data as an independent reference test where feasible. Record data provenance, missing intervals, exact execution policy and measured results. Do not report the production Coverage Map as implemented.

Publication: c91bf53 and 3b338e9 implement the tested engine/UI. Review the feature branch PR before merging to develop. Other-computer Double B work is not present in origin main/develop or PR search at this check; await user identification of its repository, branch or chat.

2026-11-27 publication verified: origin/codex/bootstrap-market-engine contains c91bf53, 3b338e9 and 9de9430. Review PR #1 (draft): https://github.com/windpipe/QuantLab/pull/1. Not merged. Remote main remains 02eb2bc and develop 136ef96. Final documentation follow-up is pushed on the same branch.
