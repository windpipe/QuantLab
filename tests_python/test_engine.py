from decimal import Decimal as D
import json

from fastapi.testclient import TestClient
import httpx
import pytest

from quantlab.api import create_app
from quantlab.backtest import simulate
from quantlab.binance import Binance, Collector
from quantlab.model import Candle, Status, series
from quantlab.resample import resample
from quantlab.store import QualityError, Store


STEP = 60_000
KEY = series("BTCUSDT", "1m")
EVIDENCE = {"reason": "deterministic test fixture"}


def bar(t, value=100):
    p = D(value)
    return Candle(t, p, p + 1, p - 1, p, D(1), D(100))


def test_snapshot_reuse_conflict_and_history(tmp_path):
    s = Store(tmp_path)
    first = s.publish(KEY, [bar(0), bar(STEP)], EVIDENCE)
    assert s.publish(KEY, [bar(0)], EVIDENCE)["revision"] == first["revision"]
    second = s.publish(KEY, [bar(2 * STEP)], EVIDENCE)
    assert len(s.read(KEY, first["revision"])[0]) == 2
    assert len(s.read(KEY)[0]) == 3
    assert second["parent"] == first["revision"]
    with pytest.raises(QualityError, match="conflicts"):
        s.publish(KEY, [bar(STEP, 101)], EVIDENCE)
    with pytest.raises(QualityError, match="coverage"):
        s.strict(KEY, 0, 3 * STEP)
    assert s.coverage(KEY, STEP, 2 * STEP)[0]["status"] == "CORRUPTED"


def test_corruption_blocks_reuse(tmp_path):
    s = Store(tmp_path)
    m = s.publish(KEY, [bar(0)], EVIDENCE)
    (tmp_path / m["path"]).write_bytes(b"tampered")
    with pytest.raises(QualityError, match="checksum"):
        s.strict(KEY, 0, STEP)
    assert s.coverage(KEY, 0, STEP)[0]["status"] == Status.CORRUPTED


def test_coverage_absence_needs_evidence_and_never_creates_bars(tmp_path):
    s = Store(tmp_path)
    assert s.coverage(KEY, 0, 10 * STEP)[0]["status"] == Status.UNKNOWN
    for status in (Status.NO_TRADES, Status.TRADING_HALTED, Status.MARKET_CLOSED):
        with pytest.raises(ValueError, match="authority"):
            s.mark(KEY, 0, STEP, status, {"reason": "empty response"})
    s.mark(KEY, STEP, 2 * STEP, Status.TRADING_HALTED,
           {"reason": "fixture notice", "authority": "exchange", "reference": "fixture://notice", "version": "1"})
    assert [r["status"] for r in s.coverage(KEY, 0, 3 * STEP)] == ["UNKNOWN", "TRADING_HALTED", "UNKNOWN"]
    assert s.read(KEY)[0] == []
    with pytest.raises(QualityError):
        s.strict(KEY, 0, 3 * STEP)


def test_bad_candles_duplicates_and_resampling(tmp_path):
    s = Store(tmp_path)
    with pytest.raises(QualityError):
        s.publish(KEY, [bar(0), bar(0, 101)], EVIDENCE)
    with pytest.raises(ValueError):
        s.publish(KEY, [bar(1)], EVIDENCE)
    with pytest.raises(ValueError):
        Candle(0, D(10), D(9), D(8), D(10), D(1)).validate(STEP)
    bars = [bar(i * STEP, 100 + i) for i in range(5)]
    out = resample(bars, "1m", "5m")
    assert (out[0].open, out[0].close, out[0].high, out[0].volume) == (D(100), D(104), D(105), D(5))
    with pytest.raises(QualityError):
        resample(bars[:-1], "1m", "5m")
    with pytest.raises(ValueError):
        resample(bars, "5m", "1m")


class FixtureBinance(Binance):
    def __init__(self, empty=False, fail=False):
        self.calls = []
        self.empty, self.fail = empty, fail

    def page(self, symbol, timeframe, start, end):
        self.calls.append((start, end))
        if self.fail:
            raise httpx.ConnectError("fixture outage")
        rows = [] if self.empty else [[t, "100", "101", "99", "100", "1", t + STEP - 1, "100", 1, "1", "1", "0"] for t in range(start, end, STEP)]
        return json.dumps(rows).encode(), "https://fixture.invalid/klines", 200


def test_collector_only_requests_front_middle_tail_and_reuses(tmp_path):
    s = Store(tmp_path)
    s.publish(KEY, [bar(STEP), bar(3 * STEP)], EVIDENCE)
    p = FixtureBinance()
    c = Collector(s, p, clock=lambda: 10000, sleep=lambda _: None)
    assert c.ensure("BTCUSDT", "1m", 0, 5 * STEP)["requests"] == 3
    assert p.calls == [(0, STEP), (2 * STEP, 3 * STEP), (4 * STEP, 5 * STEP)]
    assert c.ensure("BTCUSDT", "1m", 0, 5 * STEP)["requests"] == 0
    assert len(s.strict(KEY, 0, 5 * STEP)[0]) == 5


def test_pagination_empty_retry_and_future(tmp_path):
    s = Store(tmp_path)
    p = FixtureBinance()
    c = Collector(s, p, clock=lambda: 1000000, sleep=lambda _: None)
    c.ensure("BTCUSDT", "1m", 0, 1001 * STEP)
    assert p.calls == [(0, 1000 * STEP), (1000 * STEP, 1001 * STEP)]
    empty = Collector(s, FixtureBinance(empty=True), clock=lambda: 1000000)
    result = empty.ensure("ETHUSDT", "1m", 0, STEP)
    assert result["coverage"][0]["status"] == "UNKNOWN"
    assert empty.ensure("ETHUSDT", "1m", 0, STEP)["requests"] == 0
    failure = FixtureBinance(fail=True)
    broken = Collector(s, failure, clock=lambda: 1000000, sleep=lambda _: None)
    result = broken.ensure("ADAUSDT", "1m", 0, STEP)
    assert len(failure.calls) == 3
    assert result["coverage"][0]["status"] == "API_ERROR"
    with pytest.raises(QualityError):
        broken.ensure("ADAUSDT", "1m", 0, 2_000_000 * STEP)


def test_backtest_next_open_fees_warmup_and_last_signal():
    # Sixty warm-up bars trend upward; first executable signal at bar 60,
    # buy at bar 61 (not bar 60), then mark at final close without an exit.
    bars = [bar(i * STEP, 100 + i) for i in range(63)]
    summary, trades, equity = simulate(bars, 60 * STEP, 63 * STEP, STEP)
    assert len(trades) == 1
    t = trades[0]
    assert (t["signal_time"], t["fill_time"], t["price"]) == (60 * STEP, 61 * STEP, D(161))
    assert abs(t["quantity"] * t["price"] + t["fee"] - D(10000)) < D("1e-24")
    assert equity[0]["equity"] == D(10000)
    assert summary["completed_trades"] == 0
    assert summary["win_rate_pct"] is None
    assert summary["profit_factor"] is None
    assert len(simulate(bars[:61], 60 * STEP, 61 * STEP, STEP)[1]) == 0
    with pytest.raises(QualityError):
        simulate(bars[:61] + bars[62:], 60 * STEP, 63 * STEP, STEP)
    synthetic = Candle(0, D(100), D(101), D(99), D(100), D(1), is_synthetic=True)
    with pytest.raises(ValueError, match="real"):
        simulate([synthetic] + bars[1:], 60 * STEP, 63 * STEP, STEP)


def test_api_bounds_snapshot_and_absent_data(tmp_path):
    s = Store(tmp_path)
    m = s.publish(KEY, [bar(i * STEP) for i in range(4)], EVIDENCE)
    with TestClient(create_app(tmp_path)) as client:
        assert client.get("/health").json()["device"] == "cpu"
        r = client.get("/candles", params={"symbol": "BTCUSDT", "timeframe": "1m", "before": 3 * STEP, "limit": 2})
        assert r.status_code == 200
        assert [c["time"] for c in r.json()["candles"]] == [STEP, 2 * STEP]
        assert r.json()["snapshot"]["revision"] == m["revision"]
        assert client.get("/symbols").json()[0]["symbol"] == "BTCUSDT"
        assert client.get("/candles", params={"symbol": "ETHUSDT", "timeframe": "1m"}).status_code == 409
        assert client.get("/candles", params={"symbol": "../bad", "timeframe": "1m"}).status_code == 409
        assert client.get("/candles", params={"symbol": "BTCUSDT", "timeframe": "1m", "limit": 10001}).status_code == 422


def test_next_open_sell_fee_and_prefix_independence():
    prices = list(range(100, 190)) + list(range(190, 89, -2))
    bars = [bar(i * STEP, p) for i, p in enumerate(prices)]
    summary, trades, equity = simulate(bars, 60 * STEP, len(bars) * STEP, STEP)
    assert [t["side"] for t in trades] == ["BUY", "SELL"]
    assert summary["completed_trades"] == 1
    buy, sell = trades
    assert sell["quantity"] == buy["quantity"]
    assert abs(sell["fee"] - sell["quantity"] * sell["price"] * D("0.001")) < D("1e-24")
    # Compare only precision-independent cash values within Decimal context tolerance.
    assert abs(sell["cash_after"] - (sell["quantity"] * sell["price"] - sell["fee"])) < D("1e-22")
    short_summary, short_trades, short_equity = simulate(bars[:100], 60 * STEP, 100 * STEP, STEP)
    assert short_equity == equity[:40]
    assert short_trades == [t for t in trades if t["fill_time"] < 100 * STEP]


def test_published_file_survives_catalog_failure_as_unreferenced_orphan(tmp_path, monkeypatch):
    s = Store(tmp_path)
    original = s._event
    def fail(*args, **kwargs):
        raise RuntimeError("fixture catalog publication failure")
    monkeypatch.setattr(s, "_event", fail)
    with pytest.raises(RuntimeError):
        s.publish(KEY, [bar(0)], EVIDENCE)
    monkeypatch.setattr(s, "_event", original)
    assert s.read(KEY)[0] == []
    assert s.coverage(KEY, 0, STEP)[0]["status"] == "UNKNOWN"
    assert len(list((tmp_path / "ohlcv").rglob("*.parquet"))) == 1
    s.publish(KEY, [bar(0)], EVIDENCE)
    assert len(s.strict(KEY, 0, STEP)[0]) == 1


def test_concurrent_same_range_single_flight(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    s = Store(tmp_path)
    provider = FixtureBinance()
    def collect():
        return Collector(s, provider, clock=lambda: 1000000).ensure("BTCUSDT", "1m", 0, 2 * STEP)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: collect(), range(2)))
    assert sorted(r["requests"] for r in results) == [0, 1]
    assert len(s.read(KEY)[0]) == 2


def test_derived_snapshot_invalidates_after_source_revision(tmp_path):
    s = Store(tmp_path)
    source = s.publish(KEY, [bar(i * STEP) for i in range(5)], EVIDENCE)
    target = series("BTCUSDT", "5m")
    meta = {"derived_series": KEY, "derived_from": source["revision"]}
    derived = s.publish(target, resample(s.read(KEY)[0], "1m", "5m"), EVIDENCE, meta)
    s.publish(KEY, [bar(i * STEP) for i in range(5, 10)], EVIDENCE)
    with pytest.raises(QualityError, match="stale"):
        s.read(target)
    assert len(s.read(target, derived["revision"])[0]) == 1
    bars, source = s.read(KEY)
    s.publish(target, resample(bars, "1m", "5m"), EVIDENCE,
              {"derived_series": KEY, "derived_from": source["revision"]})
    assert len(s.read(target)[0]) == 2


def test_saved_baseline_api_verifies_artifact_hashes(tmp_path):
    from quantlab.backtest import START, END, STEP as FIVE, run_baseline
    s = Store(tmp_path)
    with TestClient(create_app(tmp_path)) as client:
        assert client.get("/backtests/baseline-001").status_code == 404
        # Deterministic fixture, exclusively for engine/API verification.
        s.publish(series("BTCUSDT", "5m"), [bar(t) for t in range(START - 60 * FIVE, END, FIVE)], EVIDENCE)
        folder, summary = run_baseline(s)
        response = client.get("/backtests/baseline-001")
        assert response.status_code == 200
        assert len(response.json()["equity"]) == 6624
        assert response.json()["trades"] == []
        (folder / "equity.csv").write_text("tampered", encoding="utf-8")
        assert client.get("/backtests/baseline-001").status_code == 409


def test_saved_annual_api_verifies_snapshot_and_report(tmp_path):
    import hashlib
    import json
    s = Store(tmp_path)
    five = 300000
    snapshot = s.publish(series("BTCUSDT", "5m"), [bar(t) for t in range(0, 62 * five, five)], EVIDENCE)
    folder = tmp_path / 'backtest_results/btc_12m_20251124_20261123'
    folder.mkdir(parents=True)
    with TestClient(create_app(tmp_path)) as client:
        assert client.get('/backtests/btc-12m').status_code == 404
        assert client.get('/backtests/btc-12m?strategy=../bad').status_code == 422
        report = {'summary': {'snapshot': snapshot, 'start_utc_ms': 60 * five, 'end_utc_ms': 62 * five},
                  'equity': [], 'trades': []}
        payload = json.dumps(report).encode()
        (folder / 'double-b_report.json').write_bytes(payload)
        (folder / 'double-b_report.sha256').write_text(hashlib.sha256(payload).hexdigest())
        response = client.get('/backtests/btc-12m')
        assert response.status_code == 200
        assert response.json()['summary']['output_kind'] == 'saved-research'
        (folder / 'double-b_report.json').write_text('{}')
        assert client.get('/backtests/btc-12m').status_code == 409
