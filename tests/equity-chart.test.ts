import { expect, it } from 'vitest';
import { equityFills, equityPoints, nearestPoint, timeTicks, valueTicks } from '../src/ui/equityChartModel';

it('places equity at candle close and fill markers at execution time with fees already paid', () => {
  const p = equityPoints([{ time: '300000', equity: '990' }, { time: '600000', equity: '1010' }], 1000, 300000, 300000);
  expect(p.map((v) => v.time)).toEqual([300000, 600000, 900000]);
  expect(p[1].drawdown).toBeCloseTo(-1);
  expect(nearestPoint(p, 640000)).toBe(1);
  const f = equityFills([
    { signal_time: '0', fill_time: '300000', side: 'BUY', price: '100', quantity: '9', fee: '1', cash_after: '99' },
    { signal_time: '300000', fill_time: '600000', side: 'SELL', price: '110', quantity: '9', fee: '1', cash_after: '1088' },
  ]);
  expect(f.map((v) => [v.time, v.equity])).toEqual([[300000, 999], [600000, 1088]]);
});

it('creates readable value grid and KST-aligned time ticks including visible boundaries', () => {
  expect(valueTicks(7572, 10162, 5)).toEqual([7000, 8000, 9000, 10000, 11000]);
  const start = Date.parse('2026-11-01T00:00:00+09:00');
  const end = Date.parse('2026-11-24T00:00:00+09:00');
  const ticks = timeTicks(start, end, 6);
  expect(ticks[0]).toBe(start);
  expect(ticks.at(-1)).toBe(end);
  expect(ticks.every((t) => (t + 9 * 3600000) % 86400000 === 0)).toBe(true);
  expect(ticks.every((t, i) => i === 0 || t > ticks[i - 1])).toBe(true);
});
