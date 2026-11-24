# Architecture decision register

| ID | Decision | Rationale |
|---|---|---|
| ADR-001 | Public Kandle fork, main upstream sync, develop integration | Preserve upstream history and isolate own changes |
| ADR-002 | Independent market data service | UI and research share durable history independently of browser limits |
| ADR-003 | Parquet + DuckDB, Python first | Local-first columnar data, efficient range queries, no dedicated DB server |
| ADR-004 | 1m canonical when available, derived higher bars | Reuse data; never reverse synthesize finer candles |
| ADR-005 | Coverage interval registry separate from OHLCV | Distinguish real absence, missing data, unavailable and unknown; avoid repeated downloads |
| ADR-006 | Evidence-backed classification, bounded retry | Prevent false completeness and endless retries |
| ADR-007 | Separate data, viewport, backtest, warm-up and fill ranges | Support large independent tests and prevent lookahead |
| ADR-008 | Kandle quick engine plus research engine | Reuse UI and support batch analysis; verify compatibility |
| ADR-009 | CPU-first, optional GPU for learning | Backtest does not inherently require GPU |
| ADR-010 | Versioned snapshots and strict quality mode | Reproducibility and honest missing-data handling |

Design decisions are provisional where source/API feasibility remains unverified. Record superseding decisions here with date, reason, impact and links. Detailed contracts in DATA.md, COVERAGE.md and BACKTEST.md.
