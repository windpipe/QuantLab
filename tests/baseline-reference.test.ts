/** Opt-in real-data parity: no market data committed, explicit local API and result path. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { compileScript } from '../src/script/engine';
import type { Candle } from '../src/data/types';

const folder = process.env.QUANTLAB_BASELINE_DIR;

it.skipIf(!folder)('matches the CPU reference on the exact real Baseline #001 snapshot', async () => {
  const reference = JSON.parse(readFileSync(join(folder!, 'summary.json'), 'utf8'));
  const params = new URLSearchParams({ symbol: 'BTCUSDT', timeframe: '5m', limit: '10000', revision: reference.snapshot.revision });
  const response = await fetch(`http://127.0.0.1:8765/candles?${params}`);
  expect(response.ok).toBe(true);
  const data = await response.json() as { candles: Candle[]; snapshot: { sha256: string } };
  expect(data.snapshot.sha256).toBe(reference.snapshot.sha256);
  expect(data.candles).toHaveLength(6684);
  // Kandle percent-of-equity excludes entry commission from its budget. Reserve
  // 1/(1+fee) of equity to reproduce the reference's cash-inclusive fee policy.
  const source = readFileSync(new URL('../src/script/strategies/baseline001.pine', import.meta.url), 'utf8');
  const compiled = compileScript(source);
  if (!compiled.ok) throw new Error(compiled.error.format());
  const engine = compiled.engine;
  engine.setSymbol({ ticker: 'BTCUSDT', period: '5', periodSeconds: 300, mintick: 0.01 });
  const result = engine.run(data.candles.map(({ time, ...c }) => ({ ...c, timestamp: time })));
  if (result.error) throw new Error(result.error.format());
  const report = engine.strategy!;
  expect(report.summary.finalEquity).toBeCloseTo(Number(reference.final_equity), 7);
  expect(report.summary.maxDrawdownPercent).toBeCloseTo(Number(reference.max_drawdown_pct), 7);
  expect(report.summary.totalClosedTrades).toBe(reference.completed_trades);
  expect(report.summary.commissionPaid).toBeCloseTo(Number(reference.fees_paid), 7);
  const rows = readFileSync(join(folder!, 'trades.csv'), 'utf8').trim().split(/\r?\n/).slice(1).map((line) => line.split(','));
  expect(report.fills).toHaveLength(rows.length);
  report.fills.forEach((fill, i) => {
    expect(fill.time).toBe(Number(rows[i][1]));
    expect(fill.side).toBe(rows[i][2] === 'BUY' ? 1 : -1);
    expect(fill.price).toBeCloseTo(Number(rows[i][3]), 8);
    expect(fill.qty).toBeCloseTo(Number(rows[i][4]), 10);
  });
  const curve = readFileSync(join(folder!, 'equity.csv'), 'utf8').trim().split(/\r?\n/).slice(1);
  curve.forEach((row, i) => expect(report.equity[i + 60]).toBeCloseTo(Number(row.split(',')[1]), 7));
}, 15000);
