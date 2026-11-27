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
| ADR-011 | Bootstrap with immutable full-series files and Decimal strings | Lossless small-data implementation; monthly compaction/query pushdown remains follow-up |
| ADR-012 | Reference crypto sizing includes entry fee, 38-digit fractional Decimal, no lot rounding | Explicit Baseline #001 convention; not a live exchange order model |
| ADR-013 | No-code strategy controls over pinned full-interval snapshots | User is not a Pine author; chart viewport must not define requested research range |
| ADR-014 | Separate Double B indicator, discretionary method and mechanical experiments | No unsupported claim that invented entry/exit rules reproduce the author's complete system |
| ADR-015 | KRX and broad Pine-compatibility expansion deferred by user | Preserve audit evidence; concentrate on BTC research and current UI |
| ADR-016 | Show saved BTC research panel independently of chart provider, expanded on entry | Fresh browser layout defaults to Binance; research interval and result context must stay explicit. Replay hides full-period results; candle fill overlays still require matching symbol/timeframe/snapshot. |

Design decisions are provisional where source/API feasibility remains unverified. Record superseding decisions here with date, reason, impact and links. Detailed contracts in DATA.md, COVERAGE.md and BACKTEST.md.
