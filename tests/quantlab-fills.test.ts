import { expect, it } from 'vitest';
import { baselineFillOverlays } from '../src/chart/quantlabFills';

it('anchors BUY/SELL only to the exact loaded fill bar and execution price', () => {
  const fill = { signal_time: '300000', fill_time: '600000', side: 'BUY', price: '100', quantity: '1', fee: '0.1' };
  const bars = [{ timestamp: 600000, open: 100, high: 101, low: 99, close: 100 }];
  const overlays = baselineFillOverlays([fill], bars);
  expect(overlays).toHaveLength(1);
  expect(overlays[0].points).toEqual([{ timestamp: 600000, value: 100 }]);
  expect(overlays[0].extendData.side).toBe('BUY');
  expect(baselineFillOverlays([{ ...fill, side: 'SELL' }], bars)[0].extendData.side).toBe('SELL');
  expect(baselineFillOverlays([{ ...fill, fill_time: '900000' }], bars)).toEqual([]);
  expect(baselineFillOverlays([{ ...fill, price: '101' }], bars)).toEqual([]);
  expect(baselineFillOverlays([{ ...fill, signal_time: '600000' }], bars)).toEqual([]);
});
