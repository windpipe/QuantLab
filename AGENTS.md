# QuantLab agent instructions

Start every session by reading docs/windpipe/PROJECT_STATE.md, NEXT_TASK.md, DECISIONS.md, WORKLOG.md and README.md in that directory. Read relevant architecture and technical documents before coding. Treat those as design intent; verify actual source and test results.

- Upstream: Kernel-Hunter/kandle. Keep main for upstream synchronization; never commit QuantLab changes there. Branch from develop for each feature, test, and merge via PR after review.
- Preserve upstream license, attribution, existing UI and features; avoid unnecessary framework rewrites.
- Local-first independent Market Data Engine, Python/FastAPI, Parquet + DuckDB. Kandle is a consumer through a DataSource adapter. CPU-first backtesting; GPU optional for AI research.
- Coverage Map is required: distinguish verified normal gaps from missing, unavailable, corrupted and unknown. Never infer no trades from an empty response alone. Store evidence, versions and retry state. No synthetic candle execution.
- Separate chart viewport, requested backtest interval, warm-up and execution resolution. Prevent lookahead; use versioned data snapshots and explicit market rules.
- Never commit market datasets, API secrets, personal information or private strategies. Bind local services to loopback by default.
- Before editing, inspect current branch/head and worktree; do not overwrite unrelated changes. Run relevant tests and record real results, not assumed successes.
- At end of each work session, update PROJECT_STATE.md, NEXT_TASK.md and WORKLOG.md; update DECISIONS.md if decisions change. Record commit/PR links, unresolved issues, reproduction commands and actual test status. Keep documentation and code consistent.

For local Codex sessions, read docs/windpipe/CODEX_HANDOFF.md and BASELINE_001.md. The user selected E: for local work; suggested defaults E:/Projects/QuantLab and E:/QuantLabData remain configurable. Verify actual local paths and never assume the checkout exists. Baseline #001 must use real exchange data; report blockers, not fabricated returns.
