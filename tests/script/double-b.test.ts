import { expect, it } from 'vitest';
import { compileScript } from '../../src/script/engine';
import { executeStrategy, strategySource, type StrategyRunOptions } from '../../src/script/strategyRunner';
import { makeCandles } from './fixtures';

const start = Date.UTC(2026, 10, 1);
const options: StrategyRunOptions = { strategy: 'double-b', start, end: start + 340 * 300000,
  capital: 10000, feePercent: .1, stopPercent: 1, requireReentry: true };
const bars = makeCandles(400).map(({ timestamp: _t, ...bar }, i) => ({ ...bar,
  low: i === 90 ? bar.low * .1 : bar.low,
  volume: bar.volume ?? 1, time: start - 60 * 300000 + i * 300000 }));

it('compiles the independently authored double-band strategy and uses only next-open long spot fills', () => {
  expect(compileScript(strategySource(options)).ok).toBe(true);
  const result = executeStrategy(bars, { revision: 'fixture' }, options);
  expect(result.equity).toHaveLength(340);
  expect(result.trades.length).toBeGreaterThan(0);
  expect(result.summary.integrity.actual_rows).toBe(400);
  for (const fill of result.trades) {
    expect(Number(fill.fill_time)).toBeGreaterThanOrEqual(start + 300000);
    expect(Number(fill.fill_time)).toBe(Number(fill.signal_time) + 300000);
    expect(Number(fill.price)).toBe(bars.find((bar) => bar.time === Number(fill.fill_time))!.open);
  }
  expect(result.trades.filter((fill) => fill.side === 'SELL').length).toBeLessThanOrEqual(result.trades.filter((fill) => fill.side === 'BUY').length);
});

it('blocks incomplete data and verifies prefix invariance against future changes', () => {
  expect(() => executeStrategy(bars.slice(1), { revision: 'fixture' }, options)).toThrow('warm-up');
  const original = executeStrategy(bars, { revision: 'fixture' }, options);
  const changed = bars.map((bar, i) => i < 200 ? bar : { ...bar, open: bar.open * 2, high: bar.high * 2, low: bar.low * 2, close: bar.close * 2 });
  const altered = executeStrategy(changed, { revision: 'fixture' }, options);
  expect(altered.equity.slice(0, 140)).toEqual(original.equity.slice(0, 140));
});
