from dataclasses import asdict, dataclass
from decimal import Decimal
from enum import StrEnum
import re


TIMEFRAMES = {"1m": 60_000, "5m": 300_000, "15m": 900_000,
              "1h": 3_600_000, "4h": 14_400_000, "1D": 86_400_000}


class Status(StrEnum):
    VALID = "VALID"
    MARKET_CLOSED = "MARKET_CLOSED"
    OUTSIDE_SESSION = "OUTSIDE_SESSION"
    NOT_LISTED = "NOT_LISTED"
    TRADING_HALTED = "TRADING_HALTED"
    NO_TRADES = "NO_TRADES"
    MISSING = "MISSING"
    CORRUPTED = "CORRUPTED"
    API_ERROR = "API_ERROR"
    UNAVAILABLE = "UNAVAILABLE"
    UNKNOWN = "UNKNOWN"
    PROVISIONAL = "PROVISIONAL"


NORMAL_GAPS = {Status.MARKET_CLOSED, Status.OUTSIDE_SESSION, Status.NOT_LISTED,
               Status.TRADING_HALTED, Status.NO_TRADES}


def interval(start: int, end: int, timeframe: str) -> int:
    step = TIMEFRAMES[timeframe]
    if start < 0 or end <= start or start % step or end % step:
        raise ValueError("Require aligned, nonempty half-open UTC range")
    return step


def series(symbol: str, timeframe: str) -> str:
    if not re.fullmatch(r"[A-Z0-9]{2,24}", symbol) or timeframe not in TIMEFRAMES:
        raise ValueError("Unsupported symbol/timeframe")
    return f"binance:spot:{symbol}:{timeframe}:raw"


@dataclass(frozen=True)
class Candle:
    time: int
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal
    turnover: Decimal | None = None
    is_final: bool = True
    is_synthetic: bool = False

    def validate(self, step: int):
        values = (self.open, self.high, self.low, self.close, self.volume)
        if not all(v.is_finite() for v in values):
            raise ValueError("Non-finite OHLCV")
        if self.time < 0 or self.time % step:
            raise ValueError("Misaligned timestamp")
        if min(self.open, self.high, self.low, self.close) <= 0 or self.volume < 0:
            raise ValueError("Invalid price/volume")
        if self.high < max(self.open, self.close) or self.low > min(self.open, self.close) or self.low > self.high:
            raise ValueError("Invalid OHLC relationship")
        if self.turnover is not None and (not self.turnover.is_finite() or self.turnover < 0):
            raise ValueError("Invalid turnover")
        if not self.is_final or self.is_synthetic:
            raise ValueError("Canonical store accepts final real candles only")

    def record(self):
        return {k: str(v) if isinstance(v, Decimal) else v for k, v in asdict(self).items()}

    @classmethod
    def from_record(cls, row):
        row = dict(row)
        for name in ("open", "high", "low", "close", "volume", "turnover"):
            row[name] = Decimal(row[name]) if row[name] is not None else None
        return cls(**row)

    def chart(self):
        return {k: float(v) if isinstance(v, Decimal) else v for k, v in self.record_decimal().items()}

    def record_decimal(self):
        return {k: v for k, v in asdict(self).items() if k in ("time", "open", "high", "low", "close", "volume")}


def runs(times, step):
    ordered = sorted(set(times))
    if not ordered:
        return []
    out = []
    start = previous = ordered[0]
    for t in ordered[1:]:
        if t != previous + step:
            out.append((start, previous + step))
            start = t
        previous = t
    return out + [(start, previous + step)]
