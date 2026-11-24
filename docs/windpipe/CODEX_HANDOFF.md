# Codex local development handoff

Repository: https://github.com/windpipe/QuantLab ; branch develop. Read AGENTS.md and relevant docs/windpipe documents before editing. Keep main upstream-only.

## Windows local environment
User selected E: drive. Suggested configurable defaults: E:/Projects/QuantLab for source, E:/QuantLabData for data. Verify actual paths and disk availability before writing. Never overwrite an existing checkout.
```powershell
New-Item -ItemType Directory -Force E:\Projects,E:\QuantLabData
Set-Location E:\Projects
git clone -b develop https://github.com/windpipe/QuantLab.git
Set-Location QuantLab
git remote add upstream https://github.com/Kernel-Hunter/kandle.git
git status
codex
```
If checkout already exists, inspect status and remote, preserve local changes, fetch origin and fast-forward safely; do not clone again. Check Node/pnpm/Python versions against manifests, create local .venv as needed.

## Proposed configuration (not yet implemented)
```toml
[storage]
data_root = "E:/QuantLabData"
database = "catalog/market.duckdb"
compression = "zstd"
[server]
host = "127.0.0.1"
port = 8765
[compute]
device = "cpu"
workers = "auto"
[data]
timezone = "Asia/Seoul"
auto_download = true
reuse_existing = true
coverage_tracking = true
missing_data_policy = "strict"
```
Data root includes catalog, raw, ohlcv, cache, features, backtest_results, models and logs. Configurable via CLI/config/environment. Keep local configuration, secrets and datasets out of Git.

## Start prompt
Read AGENTS.md, PROJECT_STATE.md, NEXT_TASK.md, DECISIONS.md, WORKLOG.md, BASELINE_001.md and relevant design documents. Verify E: paths, inspect actual source and run P0 baseline audit. Execute BTC triple SMA reference test using real data where feasible. Record results, blockers, commit/PR, and next task. No live trading.
