import type { KLineData } from 'klinecharts';

export interface StoredFill { signal_time: string; fill_time: string; side: string; price: string; quantity: string; fee: string }
export const QUANTLAB_FILL_GROUP = 'quantlab-baseline-fills';

/** Mark only real, loaded next-open fills; timestamps never snap to adjacent bars. */
export function baselineFillOverlays(fills: StoredFill[], bars: KLineData[]) {
  const byTime = new Map(bars.map((bar) => [bar.timestamp, bar]));
  return fills.flatMap((fill, i) => {
    const t = Number(fill.fill_time), price = Number(fill.price);
    const bar = byTime.get(t);
    if (!bar || !Number.isFinite(price) || Math.abs(bar.open - price) > 1e-8 ||
        Number(fill.signal_time) + 300000 !== t || !['BUY', 'SELL'].includes(fill.side)) return [];
    return [{ name: 'quantlabFill', id: `ql-fill-${i}`, groupId: QUANTLAB_FILL_GROUP, lock: true,
      points: [{ timestamp: t, value: price }], extendData: { side: fill.side, price, quantity: Number(fill.quantity) } }];
  });
}
