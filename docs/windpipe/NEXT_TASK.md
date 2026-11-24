# Next task — P0 upstream baseline

1. Fetch origin develop and inspect status, HEAD, upstream relationship, package manifests, lockfiles and documented commands.
2. Create feature/bootstrap-audit from develop (if not already present). Do not change main.
3. Inspect existing Kandle DataSource, CSV storage, Replay, strategy runtime, backtest and MCP entry points. Record real file paths, interfaces and reusable components.
4. Install dependencies using the documented package manager and pinned requirements; run the existing tests and build. Record commands, versions, exit status, failures and blockers. Do not silently change upstream dependencies to make tests pass.
5. Add baseline audit documentation and propose P1 implementation contracts: normalized candle schema, provider capability contract, interval coverage/evidence schema, manifest and atomic storage rules.
6. Update PROJECT_STATE, WORKLOG and NEXT_TASK with actual completion status, commit/PR, and the next actionable work. P1 begins after baseline findings are recorded; distinguish observed facts from proposals.

Acceptance: reproducible baseline commands and results, verified source map, identified extension points, no unintended upstream modifications. If environment cannot run tests, report not run and explain why.

## First local acceptance scenario
Verify E: paths with user, perform P0 audit, and run Baseline #001 against actual Binance data as an independent reference test where feasible. Record data provenance, missing intervals, exact execution policy and measured results. Do not report the production Coverage Map as implemented.
