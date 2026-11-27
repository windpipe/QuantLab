import { expect, it } from 'vitest';
import { fetchSnapshotBars, type StrategyRunOptions } from '../src/script/strategyRunner';

const step = 300000, start = 60 * step;
const options: StrategyRunOptions = { strategy: 'sma', start, end: 10100 * step,
  capital: 10000, feePercent: .1, stopPercent: 1, requireReentry: true };
it('pages beyond 10,000 bars while pinning the revision and exclusive cursor', async () => {
  let calls = 0;
  const bars = await fetchSnapshotBars({ revision: 'pinned' }, options, async (url) => {
    calls++;
    const query = new URL(String(url)).searchParams;
    expect(query.get('revision')).toBe('pinned');
    const before = Number(query.get('before')) / step;
    const candles = Array.from({ length: Math.min(before, 10000) }, (_, i) => ({
      time: (Math.max(0, before - 10000) + i) * step, open: 1, high: 1, low: 1, close: 1, volume: 1 }));
    return new Response(JSON.stringify({ snapshot: { revision: 'pinned' }, candles }));
  });
  expect(calls).toBe(2);
  expect(bars).toHaveLength(10100);
  expect(bars[0].time).toBe(0);
});
it('rejects a mismatched snapshot instead of combining revisions', async () => {
  await expect(fetchSnapshotBars({ revision: 'pinned' }, options, async () =>
    new Response(JSON.stringify({ snapshot: { revision: 'changed' }, candles: [] })))).rejects.toThrow('스냅샷');
});
