from datetime import datetime

from quantlab.samsung_audit import KST, audit_rows, naver_minute_quality, reference_slots


def test_reference_handles_csat_and_blocks_unexplained_missing_bars():
    slots = reference_slots()
    assert len(slots) == 16 * 78
    times = [datetime.fromtimestamp(t / 1000, KST) for t in slots]
    csat = [t for t in times if t.day == 19]
    assert (csat[0].hour, csat[0].minute) == (10, 0)
    assert (csat[-1].hour, csat[-1].minute) == (16, 25)
    rows = [{"time": t, "open": 100, "high": 101, "low": 99, "close": 100, "volume": 1} for t in slots[:-1]]
    result = audit_rows(rows)
    assert result["unresolved_slots"] == 1
    assert result["return_metrics"] is None
    assert result["backtest_status"] == "BLOCKED_INCOMPLETE_DATA"
    bad = {**rows[0], "close": float('nan')}
    assert audit_rows([bad])["invalid_or_null_rows"] == 1


def test_close_only_portal_quotes_are_not_treated_as_executable_ohlcv():
    data = "[['date','open','high','low','close','volume','foreign'], ['202611231500',null,null,null,100,200,null]]"
    quality = naver_minute_quality(data)
    assert quality["rows_without_full_ohlc"] == 1
    assert quality["decision"].startswith("NOT_EXECUTION_READY")
