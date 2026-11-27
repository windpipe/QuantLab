import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { executeStrategy, fetchSnapshotBars, type StrategyRunOptions } from '../src/script/strategyRunner';

const folder = process.env.QUANTLAB_ANNUAL_DIR;
it.skipIf(!folder)('compares a real trailing year with independent Decimal reference', async () => {
  const reference = JSON.parse(readFileSync(join(folder!, 'sma_reference.json'), 'utf8'));
  const options: StrategyRunOptions = { strategy: 'sma', start: reference.start_utc_ms, end: reference.end_utc_ms,
    capital: 10000, feePercent: .1, stopPercent: 1, requireReentry: true };
  const bars = await fetchSnapshotBars(reference.snapshot, options);
  expect(bars).toHaveLength(105180);
  const sma = executeStrategy(bars, reference.snapshot, options);
  expect(Number(sma.summary.final_equity)).toBeCloseTo(Number(reference.final_equity), 7);
  expect(Number(sma.summary.net_return_pct)).toBeCloseTo(Number(reference.net_return_pct), 7);
  expect(Number(sma.summary.max_drawdown_pct)).toBeCloseTo(Number(reference.max_drawdown_pct), 7);
  const csv = (name: string) => readFileSync(join(folder!, `sma_${name}.csv`), 'utf8').trim().split(/\r?\n/).slice(1).map(row => row.split(','));
  const fills = csv('trades');
  expect(sma.trades).toHaveLength(fills.length);
  sma.trades.forEach((fill, i) => {
    expect([fill.signal_time, fill.fill_time, fill.side]).toEqual(fills[i].slice(0, 3));
    expect(Number(fill.quantity)).toBeCloseTo(Number(fills[i][4]), 9);
    expect(Number(fill.fee)).toBeCloseTo(Number(fills[i][5]), 7);
  });
  const equity = csv('equity');
  expect(sma.equity).toHaveLength(equity.length);
  sma.equity.forEach((point, i) => expect(Number(point.equity)).toBeCloseTo(Number(equity[i][1]), 7));
  const doubleB = executeStrategy(bars, reference.snapshot, { ...options, strategy: 'double-b' });
  for (const report of [sma, doubleB]) {
    const strategy = String(report.summary.strategy_id);
    const payload = JSON.stringify({ ...report, reproduction: { measured_at: new Date().toISOString(),
      options: { ...options, strategy }, source_sha256: createHash('sha256').update(String(report.summary.source_code)).digest('hex') } }, null, 2);
    writeFileSync(join(folder!, `${strategy}_report.json`), payload);
    writeFileSync(join(folder!, `${strategy}_report.sha256`), createHash('sha256').update(payload).digest('hex'));
  }
  const comparison = [sma.summary, doubleB.summary].map(({ source_code, snapshot, integrity, ...metrics }) => metrics);
  writeFileSync(join(folder!, 'comparison.json'), JSON.stringify(comparison, null, 2));
  console.log(JSON.stringify(comparison, null, 2));
}, 180000);
