"""Complete UTC buckets for 24/7 crypto. Equity sessions require a future calendar adapter."""
from .model import Candle, TIMEFRAMES
from .store import QualityError


def resample(bars, source, target):
    a, b = TIMEFRAMES[source], TIMEFRAMES[target]
    if b < a or b % a:
        raise ValueError("Cannot synthesize finer bars")
    groups = {}
    previous = -1
    for c in bars:
        c.validate(a)
        if c.time <= previous:
            raise QualityError("Duplicate or unordered resampling input")
        previous = c.time
        groups.setdefault(c.time // b * b, []).append(c)
    out = []
    for start, group in sorted(groups.items()):
        if len(group) != b // a or any(c.time != start + i * a for i, c in enumerate(group)):
            raise QualityError("Incomplete aggregation bucket")
        out.append(Candle(start, group[0].open, max(c.high for c in group), min(c.low for c in group),
                          group[-1].close, sum(c.volume for c in group),
                          sum(c.turnover for c in group) if all(c.turnover is not None for c in group) else None))
    return out
