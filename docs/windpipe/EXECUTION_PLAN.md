# Local execution plan — 2026-11-24

All thirteen windpipe Markdown documents and their Mermaid diagrams reviewed at
136ef9673f15d130ac734cd4beffc85fa15057e0. The diagrams agree on an independent
store, evidence-backed coverage, strict snapshots, and a thin Kandle consumer.
PATTERN remains later CPU research; no UI framework replacement is warranted.

1. P0: audit original sources, install frozen JS dependencies, test/build unchanged
   upstream code, launch loopback UI. Record observed contracts and tool problems.
2. P1: add Python package, normalized Decimal candles, immutable Parquet snapshots,
   transactional DuckDB catalog, writer lock, hashes, evidence and interval coverage.
3. P2/P3: CLI and Binance public REST collector; fetch only unresolved ranges,
   paginate with bounded retries, retain raw responses, never equate empty with no trades.
4. Reference baseline: test deterministic fixtures, then acquire 6,624 real 5m bars
   and 60 warm-up bars; strict validation before calculating any result. Save raw data,
   manifest, summary, trades and equity under configurable E:/QuantLabData.
5. P4/P5/P6: complete-bucket crypto resampling, loopback FastAPI range/snapshot/
   coverage endpoints, opt-in Kandle DataSource, adapter tests and browser check.
6. Publish tested feature commits and review PR against develop. Keep main unchanged.

Acceptance focuses on repeat-request reuse, missing ranges, conflicting duplicates,
corruption, unsupported absence claims, strict backtest blocking, next-open fills,
warm-up exclusion, fees and reproducible artifacts. Do not call all roadmap phases
complete: KRX calendars/providers, Data Manager UI, research and pattern search need
separate reviewed increments. Record exact boundaries and blockers in handoff docs.
