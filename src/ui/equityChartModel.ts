import type { StoredFill } from '../chart/quantlabFills';

export interface EquityPoint { time: number; equity: number; drawdown: number }
export interface EquityFill extends StoredFill { time: number; equity: number }

/** Values are recorded at candle close; source CSV timestamps identify candle opens. */
export function equityPoints(rows: Record<string, string>[], capital: number, start: number, step: number): EquityPoint[] {
  let peak = capital;
  return [{ time: start, equity: capital, drawdown: 0 }, ...rows.map((row) => {
    const equity = Number(row.equity);
    peak = Math.max(peak, equity);
    return { time: Number(row.time) + step, equity, drawdown: (equity / peak - 1) * 100 };
  })];
}

export function equityFills(rows: (StoredFill & Record<string, string>)[]): EquityFill[] {
  return rows.map((row) => ({ ...row, time: Number(row.fill_time),
    equity: row.side === 'BUY' ? Number(row.cash_after) + Number(row.quantity) * Number(row.price) : Number(row.cash_after) }));
}

export function nearestPoint(points: EquityPoint[], time: number): number {
  let lo = 0, hi = points.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (points[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 && time - points[lo - 1].time <= points[lo].time - time ? lo - 1 : lo;
}

export function valueTicks(min: number, max: number, count = 5): number[] {
  const rough = Math.max(max - min, Math.abs(max) * 0.01, 1) / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / power;
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
  const first = Math.floor(min / step) * step, last = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round((last - first) / step) + 1 }, (_, i) => first + i * step);
}

export function timeTicks(start: number, end: number, count = 6): number[] {
  const intervals = [300000, 900000, 3600000, 14400000, 43200000, 86400000, 172800000, 345600000, 604800000, 1209600000, 2592000000, 5184000000, 7776000000, 15552000000, 31536000000];
  const step = intervals.find((v) => v >= (end - start) / count) ?? intervals[intervals.length - 1];
  const kst = 9 * 3600000;
  const first = Math.ceil((start + kst) / step) * step - kst;
  const ticks = [start];
  for (let t = first; t < end; t += step) if (t - start > step * 0.4 && end - t > step * 0.4) ticks.push(t);
  return [...ticks, end];
}
