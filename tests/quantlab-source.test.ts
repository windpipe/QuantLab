import { describe, expect, it } from 'vitest';
import { QuantLabSource } from '../src/data/quantlab-source';
import type { FetchLike } from '../src/data/types';

const bar = { time: 300000, open: 100, high: 102, low: 99, close: 101, volume: 2 };

describe('QuantLab local snapshots', () => {
  it('pages with exclusive before and pins the initial snapshot', async () => {
    const urls: string[] = [];
    const fetcher: FetchLike = async (url) => {
      urls.push(url);
      return new Response(JSON.stringify({ candles: urls.length === 1 ? [bar] : [], snapshot: { revision: 'snapshot1' } }));
    };
    const source = new QuantLabSource(undefined, fetcher);
    expect(await source.fetchCandles('BTCUSDT', '5m')).toEqual([bar]);
    expect(await source.fetchCandles('BTCUSDT', '5m', { before: 300000, limit: 100 })).toEqual([]);
    expect(new URL(urls[1]).searchParams.get('before')).toBe('300000');
    expect(new URL(urls[1]).searchParams.get('revision')).toBe('snapshot1');
    await source.fetchCandles('BTCUSDT', '5m');
    expect(new URL(urls[2]).searchParams.has('revision')).toBe(false);
  });

  it('reports service errors and malformed bars rather than exhausting history', async () => {
    const missing = new QuantLabSource(undefined, async () => new Response('', { status: 409 }));
    await expect(missing.fetchCandles('BTCUSDT', '5m')).rejects.toThrow('409');
    const invalid = new QuantLabSource(undefined, async () => new Response(JSON.stringify({ candles: [{ ...bar, high: 90 }], snapshot: { revision: 'x' } })));
    await expect(invalid.fetchCandles('BTCUSDT', '5m')).rejects.toThrow('Invalid');
    expect(() => new QuantLabSource('https://remote.invalid')).toThrow('loopback');
  });

  it('lists stored symbols/timeframes and advertises static data', async () => {
    const source = new QuantLabSource(undefined, async () => new Response(JSON.stringify([
      { symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT', pricePrecision: 8, volumePrecision: 8, timeframes: ['5m'] },
    ])));
    expect((await source.getSymbol('BTCUSDT'))?.base).toBe('BTC');
    expect(source.timeframesFor('BTCUSDT')).toEqual(['5m']);
    const statuses: string[] = [];
    source.subscribe('BTCUSDT', '5m', () => {}, { onStatus: (s) => statuses.push(s) })();
    expect(statuses).toEqual(['static']);
  });
});
