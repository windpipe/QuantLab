import { h } from './dom';
import { equityFills, equityPoints, nearestPoint, timeTicks, valueTicks, type EquityFill } from './equityChartModel';
import type { QuantLabReport } from './quantlabResults';

const fmt = (v: number, n = 2) => v.toLocaleString('en-US', { minimumFractionDigits: n, maximumFractionDigits: n });
const shortDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' });
const shortTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
const yearDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: '2-digit', month: '2-digit', day: '2-digit' });
const fullDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

/** Canvas axes remain pixel-sized when the dock resizes; all x positions use real time. */
export function createEquityChart(report: QuantLabReport) {
  const capital = Number(report.summary.initial_capital);
  const points = equityPoints(report.equity, capital, Number(report.summary.start_utc_ms), 300000);
  const fills = equityFills(report.trades);
  const globalStart = points[0].time, globalEnd = points[points.length - 1].time;
  let start = globalStart, end = globalEnd, mode = 'cash';
  let hover: { x: number; y: number } | null = null;
  let drag: { x: number; start: number; end: number } | null = null;
  let keyboardIndex = points.length - 1;
  let width = 0, height = 0;
  const canvas = h('canvas', { class: 'ql-equity-canvas', tabindex: 0, 'aria-label': '백테스트 자산곡선. KST 날짜축과 USDT 금액축. 좌우 방향키로 시점 조회, 휠로 확대, 드래그로 이동.' });
  const readout = h('div', { class: 'ql-equity-readout', role: 'status' });
  const tooltip = h('div', { class: 'ql-equity-tooltip', hidden: true });
  const unit = h('select', { class: 'ql-chart-select', 'aria-label': '자산곡선 표시 단위' }, h('option', { value: 'cash' }, '자산 · USDT'), h('option', { value: 'percent' }, '수익률 · %'));
  const markers = h('input', { type: 'checkbox', checked: true, 'aria-label': '자산곡선 매수·매도 표시' });
  const box = h('div', { class: 'ql-equity-plot' }, canvas, tooltip);
  const root = h('div', { class: 'ql-equity' },
    h('div', { class: 'ql-equity-toolbar' }, h('span', { class: 'ql-equity-key' }, '자산곡선'),
      h('label', { class: 'ql-chart-check' }, markers, '매수·매도'), unit,
      h('button', { class: 'ql-chart-button', onclick: () => { start = globalStart; end = globalEnd; hover = null; draw(); } }, '전체 기간')),
    readout, box, h('div', { class: 'ql-equity-help' }, 'KST · 봉 마감 자산 / 매매 마커는 실제 체결 시점 · 휠: 확대 · 드래그: 이동 · 방향키: 조회'));
  const abort = new AbortController();
  const value = (equity: number) => mode === 'cash' ? equity : (equity / capital - 1) * 100;
  const clampRange = (a: number, b: number) => {
    const span = Math.min(globalEnd - globalStart, Math.max(300000 * 12, b - a));
    start = Math.max(globalStart, Math.min(a, globalEnd - span));
    end = start + span;
  };
  function draw() {
    if (!canvas.isConnected) return;
    const rect = box.getBoundingClientRect();
    width = rect.width; height = rect.height;
    if (width < 1 || height < 1) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const styles = getComputedStyle(root);
    const color = (key: string) => styles.getPropertyValue(key).trim();
    const muted = color('--muted'), border = color('--border'), accent = color('--accent');
    const left = 10, right = Math.max(left + 1, width - (width < 500 ? 76 : 96)), top = 12, bottom = height - 32;
    const a = Math.max(0, nearestPoint(points, start) - 1), b = Math.min(points.length - 1, nearestPoint(points, end) + 1);
    const visibleFills = markers.checked ? fills.filter((f) => f.time >= start && f.time <= end) : [];
    const values = [...points.slice(a, b + 1).map((p) => value(p.equity)), ...visibleFills.map((f) => value(f.equity))];
    const bounds = values.reduce((acc, v) => [Math.min(acc[0], v), Math.max(acc[1], v)], [Infinity, -Infinity]);
    const ticks = valueTicks(bounds[0], bounds[1], Math.max(3, Math.floor((bottom - top) / 45)));
    const lo = ticks[0], hi = ticks[ticks.length - 1];
    const x = (t: number) => left + (t - start) / (end - start) * (right - left);
    const y = (v: number) => bottom - (v - lo) / (hi - lo || 1) * (bottom - top);
    ctx.font = '11px system-ui'; ctx.lineWidth = 1; ctx.textBaseline = 'middle';
    for (const tick of ticks) {
      const yy = Math.round(y(tick)) + .5;
      ctx.strokeStyle = border; ctx.beginPath(); ctx.moveTo(left, yy); ctx.lineTo(right, yy); ctx.stroke();
      ctx.fillStyle = muted; ctx.textAlign = 'left'; ctx.fillText(fmt(tick, mode === 'cash' ? 0 : 1) + (mode === 'percent' ? '%' : ''), right + 10, yy);
    }
    const dateTicks = timeTicks(start, end, Math.max(2, Math.floor((right - left) / 115)));
    dateTicks.forEach((tick, i) => {
      const xx = Math.round(x(tick)) + .5;
      ctx.strokeStyle = border; ctx.beginPath(); ctx.moveTo(xx, top); ctx.lineTo(xx, bottom); ctx.stroke();
      ctx.fillStyle = muted; ctx.textAlign = i === 0 ? 'left' : i === dateTicks.length - 1 ? 'right' : 'center';
      const text = end - start <= 2 * 86400000 ? shortTime.format(tick) : end - start > 120 * 86400000 ? yearDate.format(tick) : shortDate.format(tick).split('/').reverse().join('/');
      ctx.fillText(text, xx, bottom + 17);
    });
    ctx.save(); ctx.beginPath(); ctx.rect(left, top, right - left, bottom - top); ctx.clip();
    const initial = value(capital);
    if (initial >= lo && initial <= hi) {
      ctx.strokeStyle = muted; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(left, y(initial)); ctx.lineTo(right, y(initial)); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.beginPath();
    for (let i = a; i <= b; i++) { const p = points[i]; if (i === a) ctx.moveTo(x(p.time), y(value(p.equity))); else ctx.lineTo(x(p.time), y(value(p.equity))); }
    ctx.strokeStyle = accent; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.lineTo(x(points[b].time), bottom); ctx.lineTo(x(points[a].time), bottom); ctx.closePath();
    ctx.fillStyle = 'rgba(47,128,237,0.08)'; ctx.fill();
    for (const fill of visibleFills) {
      const xx = x(fill.time), yy = y(value(fill.equity)), buy = fill.side === 'BUY';
      const sign = buy ? 1 : -1;
      ctx.fillStyle = buy ? '#2962ff' : '#e91e63';
      ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx - 4, yy + sign * 9); ctx.lineTo(xx + 4, yy + sign * 9); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = muted; ctx.textAlign = 'left'; ctx.fillText(mode === 'cash' ? 'USDT' : '%', right + 10, Math.max(6, top - 6));
    let point = points[points.length - 1], hit: EquityFill | undefined;
    if (hover && hover.x >= left && hover.x <= right) {
      const t = start + (hover.x - left) / (right - left) * (end - start);
      point = points[nearestPoint(points, t)];
      hit = visibleFills.find((f) => Math.abs(x(f.time) - hover!.x) <= 9 && Math.abs(y(value(f.equity)) - hover!.y) <= 16);
      const xx = x(hit?.time ?? point.time), yy = y(value(hit?.equity ?? point.equity));
      ctx.strokeStyle = muted; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(xx, top); ctx.lineTo(xx, bottom); ctx.moveTo(left, yy); ctx.lineTo(right, yy); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = color('--text'); ctx.beginPath(); ctx.arc(xx, yy, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color('--panel-2'); ctx.fillRect(right + 2, yy - 10, width - right - 2, 20);
      ctx.fillStyle = color('--text'); ctx.textAlign = 'left'; ctx.fillText(fmt(value(hit?.equity ?? point.equity)), right + 7, yy);
    }
    const current = hit?.equity ?? point.equity;
    readout.textContent = `${fullDate.format(hit?.time ?? point.time)} KST  ·  ${hit ? hit.side + ' 체결' : '봉 마감'}  ·  자산 ${fmt(current)} USDT  ·  누적 손익 ${fmt(current - capital)} USDT (${fmt((current / capital - 1) * 100)}%)`;
    tooltip.hidden = !hit;
    if (hit) {
      tooltip.replaceChildren(h('strong', {}, `${hit.side === 'BUY' ? '▲ BUY · 진입' : '▼ SELL · 청산'}  ${fullDate.format(hit.time)} KST`),
        h('span', {}, `가격 ${fmt(Number(hit.price))} USDT · 수량 ${fmt(Number(hit.quantity), 8)} BTC`),
        h('span', {}, `수수료 ${fmt(Number(hit.fee), 4)} USDT · 체결 후 자산 ${fmt(hit.equity)} USDT`));
      tooltip.style.left = `${Math.max(4, Math.min(width - Math.min(355, width - 8), hover!.x + 12))}px`;
      tooltip.style.top = `${Math.max(4, Math.min(height - 90, hover!.y - 88))}px`;
    }
  }
  const eventPoint = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener('pointermove', (e) => {
    hover = eventPoint(e);
    if (drag) {
      const delta = (hover.x - drag.x) / Math.max(1, width - 106) * (drag.end - drag.start);
      clampRange(drag.start - delta, drag.end - delta);
    }
    draw();
  }, { signal: abort.signal });
  canvas.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; drag = { x: eventPoint(e).x, start, end }; canvas.setPointerCapture(e.pointerId); }, { signal: abort.signal });
  canvas.addEventListener('pointerup', () => { drag = null; }, { signal: abort.signal });
  canvas.addEventListener('pointercancel', () => { drag = null; }, { signal: abort.signal });
  canvas.addEventListener('pointerleave', () => { if (!drag) { hover = null; draw(); } }, { signal: abort.signal });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - r.left - 10) / Math.max(1, width - 106)));
    const center = start + (end - start) * ratio;
    const span = Math.max(3600000, Math.min(globalEnd - globalStart, (end - start) * (e.deltaY > 0 ? 1.25 : .8)));
    clampRange(center - span * ratio, center + span * (1 - ratio)); draw();
  }, { passive: false, signal: abort.signal });
  canvas.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    keyboardIndex = e.key === 'Home' ? 0 : e.key === 'End' ? points.length - 1 : Math.max(0, Math.min(points.length - 1, keyboardIndex + (e.key === 'ArrowLeft' ? -1 : 1)));
    const p = points[keyboardIndex];
    if (p.time < start || p.time > end) clampRange(p.time - (end - start) / 2, p.time + (end - start) / 2);
    hover = { x: 10 + (p.time - start) / (end - start) * Math.max(1, width - (width < 500 ? 86 : 106)), y: 0 }; draw();
  }, { signal: abort.signal });
  unit.addEventListener('change', () => { mode = unit.value; draw(); }, { signal: abort.signal });
  markers.addEventListener('change', draw, { signal: abort.signal });
  const observer = new ResizeObserver(draw); observer.observe(box);
  return { root, destroy() { observer.disconnect(); abort.abort(); } };
}
