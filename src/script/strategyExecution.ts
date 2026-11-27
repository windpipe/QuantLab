import { compileScript } from './engine';
import type { Candle } from '../data/types';
import type { QuantLabReport } from '../ui/quantlabResults';
import smaSource from './strategies/baseline001.pine?raw';
import doubleBSource from './strategies/double-b.pine?raw';

export type ResearchStrategy = 'sma' | 'double-b';
export interface StrategyRunOptions {
  strategy: ResearchStrategy;
  start: number;
  end: number;
  capital: number;
  feePercent: number;
  stopPercent: number;
  requireReentry: boolean;
}
export const STRATEGY_NAMES = { sma: 'SMA 5/20/60 정배열', 'double-b': '더블비 · 현물 실험형' } as const;

export function strategySource(options: StrategyRunOptions): string {
  return (options.strategy === 'sma' ? smaSource : doubleBSource)
    .replaceAll('1793458800000', String(options.start)).replaceAll('1795446000000', String(options.end));
}

/** Execute only exact, continuous real snapshot inputs. Never use the chart viewport. */
export function executeStrategy(bars: Candle[], snapshot: QuantLabReport['summary']['snapshot'], options: StrategyRunOptions): QuantLabReport {
  const step = 300000, first = options.start - 60 * step;
  if (!(options.strategy in STRATEGY_NAMES) || bars.length > 200000) throw new Error('지원하는 전략과 최대 20만 봉 범위를 확인해주세요.');
  if (!Number.isFinite(options.capital) || options.capital <= 0 || !Number.isFinite(options.feePercent) || options.feePercent < 0 || options.feePercent > 5 ||
      !Number.isFinite(options.stopPercent) || options.stopPercent <= 0 || options.stopPercent > 50 ||
      !Number.isSafeInteger(options.start) || !Number.isSafeInteger(options.end) || options.end <= options.start || options.start % step || options.end % step) {
    throw new Error('기간·초기 자본·수수료·손절 설정을 확인해주세요.');
  }
  if (bars.length !== (options.end - first) / step || bars.some((bar, i) => bar.time !== first + i * step ||
      ![bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite) || bar.volume < 0 ||
      Math.min(bar.open, bar.high, bar.low, bar.close) <= 0 || bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close))) {
    throw new Error('요청 기간과 warm-up 60봉을 모두 확보해야 합니다. 저장된 데이터 범위를 확인해주세요.');
  }
  const source = strategySource(options), compiled = compileScript(source);
  if (!compiled.ok) throw new Error(compiled.error.format());
  const engine = compiled.engine;
  // Research runs execute in an isolated worker; retain the operation budget and
  // allow bounded CPU time for a year of 5m history. Chart/editor defaults stay unchanged.
  engine.budget.timeLimitMs = 15000;
  engine.setSymbol({ ticker: 'BTCUSDT', source: 'quantlab', period: '5', periodSeconds: 300, mintick: .01 });
  engine.setStrategySettings({ initialCapital: options.capital, commissionValue: options.feePercent,
    defaultQtyValue: 100 / (1 + options.feePercent / 100) });
  const inputs: Record<string, number | boolean> = {};
  for (const def of engine.inputs) {
    if (def.title === 'Stop loss percent') inputs[def.key] = options.stopPercent;
    if (def.title === 'Require band reentry') inputs[def.key] = options.requireReentry;
  }
  engine.setInputValues(inputs);
  const run = engine.run(bars.map(({ time, ...bar }) => ({ ...bar, timestamp: time })));
  if (run.error) throw new Error(run.error.format());
  const report = engine.strategy!, s = report.summary;
  let cash = options.capital;
  const trades = report.fills.map((fill) => {
    const fee = fill.qty * fill.price * options.feePercent / 100;
    cash += fill.side > 0 ? -fill.qty * fill.price - fee : fill.qty * fill.price - fee;
    return { signal_time: String(fill.time - step), fill_time: String(fill.time), side: fill.side > 0 ? 'BUY' : 'SELL',
      price: String(fill.price), quantity: String(fill.qty), fee: String(fee), cash_after: String(Math.abs(cash) < 1e-8 ? 0 : cash) };
  });
  let quantity = 0, fillIndex = 0;
  cash = options.capital;
  const equity = bars.slice(60).map((bar, i) => {
    while (fillIndex < trades.length && Number(trades[fillIndex].fill_time) <= bar.time) {
      const fill = trades[fillIndex++];
      quantity = fill.side === 'BUY' ? Number(fill.quantity) : 0;
      cash = Number(fill.cash_after);
    }
    return { time: String(bar.time), equity: String(report.equity[i + 60]), cash: String(cash), quantity: String(quantity) };
  });
  const benchmark = options.capital / (bars[60].open * (1 + options.feePercent / 100)) * bars[bars.length - 1].close;
  return { summary: {
    strategy_id: options.strategy, strategy_name: STRATEGY_NAMES[options.strategy], source_code: source,
    start_utc_ms: options.start, end_utc_ms: options.end, initial_capital: options.capital,
    fee_fraction_per_side: options.feePercent / 100, warmup_bars: 60, execution_bars: bars.length - 60,
    final_equity: s.finalEquity, net_return_pct: (s.finalEquity / options.capital - 1) * 100, max_drawdown_pct: s.maxDrawdownPercent,
    completed_trades: s.totalClosedTrades, win_rate_pct: s.percentProfitable, profit_factor: s.profitFactor,
    fees_paid: s.commissionPaid, open_quantity: s.positionSize, buy_and_hold_return_pct: (benchmark / options.capital - 1) * 100,
    snapshot, integrity: { actual_rows: bars.length, missing_slots: 0 }, engine: 'QuantLab/Kandle CPU',
    interpretation: options.strategy === 'double-b' ? '밴드 20/2 종가 + 4/4 시가. 원저자 공식 자동매매 코드가 아닌 실험적 현물 해석. 종가 기준 청산/손절 후 다음 봉 시가 체결.' : 'SMA 5/20/60 기준 전략',
    stop_percent: options.stopPercent, require_reentry: options.requireReentry, output_kind: 'interactive', compute_ms: run.ms,
  }, trades, equity };
}
