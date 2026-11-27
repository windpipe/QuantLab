import type { KLineData } from 'klinecharts';
import type { Candle } from '../data/types';

/** Bounded backward paging; reject overlaps/stalled cursors rather than corrupt replay. */
export async function replayHistory(bars: KLineData[], fetchPage: (before: number, limit: number) => Promise<Candle[]>,
  local: boolean, fromTime?: number, count?: number): Promise<KLineData[]> {
  const covered = () => (fromTime === undefined || bars[0].timestamp <= fromTime) && (count === undefined || bars.length >= count);
  const limit = local ? 10000 : 1000, maxPages = local ? 20 : 10;
  for (let page = 0; page < maxPages && !covered(); page++) {
    const before = bars[0].timestamp;
    const older = await fetchPage(before, limit);
    if (!older.length) break;
    if (bars.length + older.length > 200000 || older.some((bar, i) => !Number.isFinite(bar.time) ||
      bar.time >= before || (i > 0 && bar.time <= older[i - 1].time))) throw new Error('Replay 기록의 순서·중복·최대 20만 봉 범위를 확인해주세요.');
    bars = older.map<KLineData>(({ time, ...bar }) => ({ ...bar, timestamp: time })).concat(bars);
  }
  return bars;
}
