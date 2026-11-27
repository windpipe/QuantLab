import type { Candle, DataSource, FetchCandlesOptions, FetchLike, SubscribeOptions, SymbolMeta } from './types';
import { getTimeframe, type TimeframeId } from './timeframes';

interface StoredSymbol extends SymbolMeta { timeframes: TimeframeId[] }

/** Read-only consumer of the independent local store. No remote-provider fallback. */
export class QuantLabSource implements DataSource {
  readonly id = 'quantlab';
  readonly name = 'QuantLab local';
  readonly local = true;
  readonly timeframes = ['1m', '5m', '15m', '1h', '4h', '1D'] as const;
  readonly note = 'Verified local snapshots. Collect history with the QuantLab CLI.';
  private symbols: StoredSymbol[] = [];
  private revisions = new Map<string, string>();

  constructor(private readonly base = 'http://127.0.0.1:8765', private readonly fetcher: FetchLike = globalThis.fetch.bind(globalThis)) {
    const url = new URL(base);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) {
      throw new Error('QuantLab requires a loopback HTTP endpoint');
    }
  }

  private async request(path: string): Promise<unknown> {
    const response = await this.fetcher(`${this.base}${path}`, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`QuantLab local data unavailable (${response.status}). Verify coverage with the CLI.`);
    return response.json();
  }

  async listSymbols(): Promise<SymbolMeta[]> {
    const data = await this.request('/symbols');
    if (!Array.isArray(data)) throw new Error('Invalid QuantLab symbol response');
    this.symbols = data as StoredSymbol[];
    return this.symbols;
  }

  async getSymbol(symbol: string): Promise<SymbolMeta | null> {
    return (await this.listSymbols()).find((s) => s.symbol === symbol) ?? null;
  }

  timeframesFor(symbol: string): readonly TimeframeId[] {
    return this.symbols.find((s) => s.symbol === symbol)?.timeframes ?? this.timeframes;
  }

  snapshotFor(symbol: string, timeframe: TimeframeId): string | undefined {
    return this.revisions.get(`${symbol}:${timeframe}`);
  }

  async fetchCandles(symbol: string, timeframe: TimeframeId, options: FetchCandlesOptions = {}): Promise<Candle[]> {
    const params = new URLSearchParams({ symbol, timeframe, limit: String(Math.max(1, Math.min(options.limit ?? 500, 10000))) });
    if (options.before !== undefined) params.set('before', String(options.before));
    const key = `${symbol}:${timeframe}`;
    // A new chart load captures a head; older pages keep that immutable revision.
    if (options.before === undefined) this.revisions.delete(key);
    const revision = this.revisions.get(key);
    if (revision) params.set('revision', revision);
    const data = await this.request(`/candles?${params}`) as { candles?: Candle[]; snapshot?: { revision: string } };
    if (!Array.isArray(data.candles) || !data.snapshot?.revision) throw new Error('Invalid QuantLab candle response');
    let previous = -Infinity;
    const step = getTimeframe(timeframe)!.ms;
    for (const c of data.candles) {
      if (![c.time, c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite) ||
          c.time <= previous || c.time % step !== 0 || c.volume < 0 || Math.min(c.open, c.high, c.low, c.close) <= 0 ||
          c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close) || c.low > c.high ||
          (options.before !== undefined && c.time >= options.before)) throw new Error('Invalid QuantLab candles');
      previous = c.time;
    }
    this.revisions.set(key, data.snapshot.revision);
    return data.candles;
  }

  subscribe(_symbol: string, _timeframe: TimeframeId, _onCandle: (candle: Candle) => void, options?: SubscribeOptions): () => void {
    options?.onStatus?.('static');
    return () => {};
  }
}
