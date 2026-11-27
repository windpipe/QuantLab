import type { Candle, FetchLike } from '../data/types';
import type { QuantLabReport } from '../ui/quantlabResults';
import { executeStrategy, type StrategyRunOptions } from './strategyExecution';
export { executeStrategy, strategySource, STRATEGY_NAMES } from './strategyExecution';
export type { ResearchStrategy, StrategyRunOptions } from './strategyExecution';

export async function currentSnapshot(): Promise<QuantLabReport['summary']['snapshot']> {
  const response = await fetch('http://127.0.0.1:8765/candles?symbol=BTCUSDT&timeframe=5m&limit=1', { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('검증된 최신 데이터 스냅샷을 읽지 못했습니다.');
  const data = await response.json();
  if (!data.snapshot?.revision) throw new Error('스냅샷 버전이 없습니다.');
  return data.snapshot;
}

export async function fetchSnapshotBars(snapshot: QuantLabReport['summary']['snapshot'], options: StrategyRunOptions, fetcher: FetchLike = fetch): Promise<Candle[]> {
  const first = options.start - 60 * 300000, expected = (options.end - first) / 300000;
  if (!Number.isSafeInteger(expected) || expected <= 60 || expected > 200000) throw new Error('기간은 5분봉 기준 최대 20만 봉까지 지원합니다.');
  const bars: Candle[] = [];
  let before = options.end;
  for (let page = 0; page <= Math.ceil(expected / 10000); page++) {
    const params = new URLSearchParams({ symbol: 'BTCUSDT', timeframe: '5m', revision: snapshot.revision,
      start: String(first), end: String(options.end), before: String(before), limit: '10000' });
    const response = await fetcher(`http://127.0.0.1:8765/candles?${params}`, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('로컬 스냅샷 데이터를 확보하지 못했습니다. 기간과 Coverage를 확인해주세요.');
    const data = await response.json();
    if (data.snapshot?.revision !== snapshot.revision) throw new Error('데이터 스냅샷이 일치하지 않습니다.');
    if (!Array.isArray(data.candles)) throw new Error('캔들 응답 형식이 올바르지 않습니다.');
    const chunk: Candle[] = data.candles;
    if (!chunk.length) break;
    if (chunk[0].time >= before || chunk[chunk.length - 1].time >= before) throw new Error('페이지 커서가 진행하지 않습니다.');
    bars.push(...chunk);
    before = chunk[0].time;
    if (before <= first || chunk.length < 10000) break;
  }
  bars.sort((a, b) => a.time - b.time);
  if (bars.length !== expected || bars.some((bar, i) => bar.time !== first + i * 300000)) throw new Error('요청 기간 또는 warm-up에 누락·중복이 있습니다. 실행하지 않습니다.');
  return bars;
}

export async function runSnapshotStrategy(snapshot: QuantLabReport['summary']['snapshot'], options: StrategyRunOptions): Promise<QuantLabReport> {
  const bars = await fetchSnapshotBars(snapshot, options);
  if (typeof Worker === 'undefined') return executeStrategy(bars, snapshot, options);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./research.worker.ts', import.meta.url), { type: 'module' });
    const timeout = setTimeout(() => { worker.terminate(); reject(new Error('CPU 실행 제한 시간을 초과했습니다.')); }, 20000);
    const finish = () => { clearTimeout(timeout); worker.terminate(); };
    worker.onmessage = (event) => { finish(); if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.result); };
    worker.onerror = () => { finish(); reject(new Error('백테스트 CPU 작업 중 오류가 발생했습니다.')); };
    worker.postMessage({ bars, snapshot, options });
  });
}
