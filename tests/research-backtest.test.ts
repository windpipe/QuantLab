import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { executeStrategy, type StrategyRunOptions } from '../src/script/strategyRunner';

const folder = process.env.QUANTLAB_BASELINE_DIR;

it.skipIf(!folder)('executes selected strategies over the real full snapshot independently of the chart', async () => {
  const baseline = JSON.parse(readFileSync(join(folder!, 'summary.json'), 'utf8'));
  const query = new URLSearchParams({ symbol: 'BTCUSDT', timeframe: '5m', revision: baseline.snapshot.revision, limit: '10000' });
  const response = await fetch(`http://127.0.0.1:8765/candles?${query}`);
  expect(response.ok).toBe(true);
  const data = await response.json();
  const options: StrategyRunOptions = { strategy: 'sma', start: baseline.start_utc_ms, end: baseline.end_utc_ms,
    capital: 10000, feePercent: .1, stopPercent: 1, requireReentry: true };
  const sma = executeStrategy(data.candles, data.snapshot, options);
  expect(sma.summary.final_equity).toBeCloseTo(Number(baseline.final_equity), 7);
  const doubleB = executeStrategy(data.candles, data.snapshot, { ...options, strategy: 'double-b' });
  expect(doubleB.equity).toHaveLength(6624);
  expect(doubleB.summary.integrity.actual_rows).toBe(6684);
  for (const fill of doubleB.trades) {
    expect(Number(fill.fill_time)).toBeGreaterThanOrEqual(baseline.start_utc_ms + 300000);
    expect(Number(fill.fill_time)).toBeLessThan(baseline.end_utc_ms);
  }
  const output = process.env.QUANTLAB_RESEARCH_OUTPUT;
  if (output) {
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, 'report.json'), JSON.stringify({ ...doubleB,
      reproduction: { measured_at: new Date().toISOString(), options: { ...options, strategy: 'double-b' },
        source_sha256: createHash('sha256').update(String(doubleB.summary.source_code)).digest('hex') } }, null, 2));
    writeFileSync(join(output, 'summary.json'), JSON.stringify(doubleB.summary, null, 2));
  }
}, 15000);
