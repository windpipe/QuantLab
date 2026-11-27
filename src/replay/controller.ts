import type { Chart, KLineData } from 'klinecharts';
import { getSource } from '../data/sources';
import type { TimeframeId } from '../data/timeframes';
import { h } from '../ui/dom';
import { createModal } from '../ui/modal';
import { replayHistory } from './history';
import type { SwitchingLoader } from './loader';
import { REPLAY_SPEEDS, ReplaySession, indexAtTime, stepInterval, replayDate, replayTime, replaySpeed } from './session';

export interface ReplayContext {
  source: string;
  symbol: string;
  timeframe: TimeframeId;
}

export interface ReplayOptions {
  chart: () => Chart;
  loader: SwitchingLoader;
  /** Element the control bar and the pick hint are placed in (the main chart's wrapper). */
  container: HTMLElement;
  context: () => ReplayContext;
  toast: (message: string, kind?: 'info' | 'error') => void;
}

export interface ReplayStartOptions {
  startTime?: number;
  barsBack?: number;
  speed?: number;
  autoplay?: boolean;
}

export interface ReplayState {
  active: boolean;
  picking: boolean;
  playing: boolean;
  speed: number;
  start_time?: string;
  current_time?: string;
  bars_visible?: number;
  bars_remaining?: number;
}

const iso = (t: number) => new Date(t).toISOString();

const ICON = {
  play: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M7 5v14l12-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  step: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M5 5v14l10-7zM16 5h3v14h-3z"/></svg>',
  pick: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3v18M4 12h4M16 12h4"/></svg>',
  exit: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};

/**
 * Bar replay for the main chart: pick a start bar, then step or play forward while every
 * later bar stays hidden. Indicators recompute on what is visible because the chart only
 * ever holds visible bars. Exiting reloads live data.
 */
export class ReplayController {
  private session: ReplaySession | null = null;
  private picking = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private speed = 1;
  private readonly listeners = new Set<() => void>();
  private pickCleanup: (() => void) | null = null;

  private readonly bar: HTMLElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly stepBtn: HTMLButtonElement;
  private readonly speedSel: HTMLSelectElement;
  private readonly label: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly position: HTMLElement;
  private readonly currentTimeLabel: HTMLElement;
  private readonly progressLabel: HTMLElement;
  private readonly progressBar: HTMLProgressElement;
  private readonly follow: HTMLInputElement;

  constructor(private readonly options: ReplayOptions) {
    this.playBtn = h('button', { class: 'rp-btn', title: 'Play or pause (Space)', 'aria-label': 'Play', html: ICON.play, onclick: () => this.toggle() });
    this.stepBtn = h('button', { class: 'rp-btn', title: 'Step forward one bar (Right arrow)', 'aria-label': 'Step forward', html: ICON.step, onclick: () => this.step(1) });
    this.speedSel = h(
      'select',
      { class: 'rp-speed', title: 'Speed in bars per second', 'aria-label': 'Replay speed', onchange: () => this.setSpeed(Number(this.speedSel.value)) },
      ...REPLAY_SPEEDS.map((s) => h('option', { value: String(s) }, `${s}x`)),
    ) as HTMLSelectElement;
    this.speedSel.value = String(this.speed);
    this.label = h('span', { class: 'rp-label' });
    this.bar = h(
      'div',
      { class: 'replay-bar', hidden: true, role: 'toolbar', 'aria-label': 'Bar replay' },
      h('span', { class: 'rp-title' }, 'Replay'),
      h('button', { class: 'rp-btn', title: '날짜·시간으로 시작점 변경', 'aria-label': '리플레이 시작 시각 변경', onclick: () => this.open() }, '시점'),
      h('button', { class: 'rp-btn', title: 'Pick a new start bar', 'aria-label': 'Pick start bar', html: ICON.pick, onclick: () => this.pick() }),
      this.playBtn,
      this.stepBtn,
      this.speedSel,
      this.label,
      h('button', { class: 'rp-btn rp-exit', title: 'Exit replay and return to live (Esc)', 'aria-label': 'Exit replay', html: ICON.exit, onclick: () => this.stop() }),
    );
    this.hint = h('div', { class: 'replay-hint', hidden: true }, 'Click a bar to start replay from it. Esc cancels.');
    this.currentTimeLabel = h('strong', { class: 'rp-current-time' });
    this.progressLabel = h('span', { class: 'rp-progress-label' });
    this.progressBar = h('progress', { max: 100, value: 0, 'aria-label': '리플레이 진행률' });
    this.follow = h('input', { type: 'checkbox', checked: true, onchange: () => { if (this.follow.checked) this.focusCurrent(); } });
    this.position = h('section', { class: 'replay-position', hidden: true, 'aria-label': '리플레이 현재 위치' },
      this.currentTimeLabel, this.progressLabel, this.progressBar,
      h('div', { class: 'rp-position-actions' },
        h('label', {}, this.follow, '현재 봉 따라가기'),
        h('button', { class: 'btn', onclick: () => this.focusCurrent() }, '현재 봉으로')));
    options.container.append(this.bar, this.hint, this.position);

    options.loader.onReplayInterrupted(() => {
      this.pause();
      this.session = null;
      this.render();
      options.toast('Replay ended because the symbol or timeframe changed');
    });

    document.addEventListener('keydown', (e) => this.onKey(e), true);
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get active(): boolean {
    return this.session !== null;
  }

  state(): ReplayState {
    const s = this.session;
    const state: ReplayState = { active: s !== null, picking: this.picking, playing: this.timer !== null, speed: this.speed };
    if (s) {
      state.current_time = iso(s.current().timestamp);
      state.bars_visible = s.index + 1;
      state.bars_remaining = s.remaining;
    }
    if (this.startTime !== null && s) state.start_time = iso(this.startTime);
    return state;
  }

  private startTime: number | null = null;
  private startGeneration = 0;

  /** Time entry complements the existing chart-click picker. */
  open(): void {
    this.pause();
    const bars = this.session ? this.session.all() : this.options.chart().getDataList();
    const initial = this.startTime ?? bars[Math.max(0, bars.length - 101)]?.timestamp ?? Date.now();
    const modal = createModal('차트 리플레이', { onClose: () => { this.startGeneration++; modal.root.remove(); } });
    const date = h('input', { type: 'datetime-local', value: replayDate(initial), 'aria-label': '리플레이 시작 시각 KST', required: true });
    const speed = h('select', { 'aria-label': '리플레이 배속' }, ...REPLAY_SPEEDS.map(value => h('option', { value: String(value) }, `${value}×`)));
    speed.value = String(this.speed);
    const status = h('p', { role: 'status', class: 'muted' });
    const begin = h('button', { class: 'btn btn-primary', type: 'submit' }, '이 시점부터 재생');
    const form = h('form', { class: 'rp-start-form' },
      h('p', {}, '선택한 봉까지 표시하고 다음 봉부터 차례로 재생합니다. 미래 봉은 숨깁니다.'),
      h('label', {}, '시작 날짜·시간 (KST)', date), h('label', {}, '재생 배속', speed),
      h('p', { class: 'muted' }, '1× = 초당 1봉 · Space 재생/일시정지 · → 한 봉 이동 · Esc 종료. 저장된 데이터 범위 안에서 선택하세요.'),
      status, h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => { modal.close(); this.pick(); } }, '차트에서 시작 봉 선택'), begin));
    form.addEventListener('submit', async event => {
      event.preventDefault();
      begin.disabled = true;
      status.textContent = '시작 시점의 기록을 불러오는 중…';
      try {
        await this.start({ startTime: replayTime(date.value), speed: Number(speed.value), autoplay: true });
        modal.close();
      } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
      finally { begin.disabled = false; }
    });
    modal.body.append(form);
    modal.open();
    date.focus();
  }

  /** Enters pick mode: the next click on the chart chooses the start bar. */
  pick(): void {
    if (this.picking) return;
    this.pause();
    this.picking = true;
    this.hint.hidden = false;
    this.options.container.classList.add('replay-picking');
    const chartEl = this.options.container.querySelector<HTMLElement>('.chart') ?? this.options.container;
    const onClick = (e: MouseEvent) => {
      const chart = this.options.chart();
      const rect = chartEl.getBoundingClientRect();
      const result = chart.convertFromPixel([{ x: e.clientX - rect.left, y: e.clientY - rect.top }], { paneId: 'candle_pane' });
      const point = Array.isArray(result) ? result[0] : result;
      const bars = this.session ? this.session.visible() : chart.getDataList();
      let time = point?.timestamp;
      if (time === undefined && point?.dataIndex !== undefined) time = bars[Math.max(0, Math.min(bars.length - 1, point.dataIndex))]?.timestamp;
      e.stopPropagation();
      e.preventDefault();
      this.endPick();
      if (time === undefined) {
        this.options.toast('Could not find a bar there', 'error');
        return;
      }
      void this.start({ startTime: time }).catch((error: unknown) => this.options.toast(error instanceof Error ? error.message : String(error), 'error'));
    };
    chartEl.addEventListener('click', onClick, { capture: true, once: true });
    this.pickCleanup = () => chartEl.removeEventListener('click', onClick, { capture: true });
    this.emit();
  }

  private endPick(): void {
    this.picking = false;
    this.hint.hidden = true;
    this.options.container.classList.remove('replay-picking');
    this.pickCleanup?.();
    this.pickCleanup = null;
    this.emit();
  }

  /** Starts (or restarts) replay. Without a start, it begins 100 bars back. */
  async start(opts: ReplayStartOptions = {}): Promise<ReplayState> {
    const generation = ++this.startGeneration;
    if (this.picking) this.endPick();
    this.pause();
    const chart = this.options.chart();
    const ctx = this.options.context();
    // Restarting from inside a replay must use every bar, not only the visible ones.
    let bars: KLineData[] = this.session ? this.session.all() : chart.getDataList().map((b) => ({ ...b }));
    if (bars.length < 2) throw new Error('No data on the chart yet');

    const barsBack = opts.startTime === undefined ? (opts.barsBack ?? 100) : undefined;
    const needTime = opts.startTime;
    bars = await this.ensureHistory(bars, ctx, needTime, barsBack !== undefined ? barsBack + 1 : undefined);
    const current = this.options.context();
    if (generation !== this.startGeneration || current.source !== ctx.source || current.symbol !== ctx.symbol || current.timeframe !== ctx.timeframe) {
      throw new Error('차트 또는 재생 요청이 변경되어 시작을 취소했습니다.');
    }
    if (needTime !== undefined && (!Number.isFinite(needTime) || needTime > bars[bars.length - 1].timestamp)) {
      throw new Error('마지막 데이터보다 이전의 시작 시각을 선택해주세요.');
    }

    let index: number;
    if (needTime !== undefined) {
      index = indexAtTime(bars, needTime);
      if (index < 0) throw new Error(`No history as far back as ${iso(needTime)}; the earliest bar is ${iso(bars[0].timestamp)}`);
    } else {
      index = bars.length - 1 - (barsBack ?? 100);
      if (index < 0) index = 0;
    }
    if (index >= bars.length - 1) throw new Error('Pick a start bar before the latest one');

    const session = new ReplaySession(bars, index);
    const symbol = chart.getSymbol();
    const period = chart.getPeriod();
    if (!symbol || !period) throw new Error('Chart is not ready');
    this.session = session;
    this.startTime = bars[index].timestamp;
    if (opts.speed) this.setSpeed(opts.speed);
    this.options.loader.enterReplay({ initial: () => session.visible(), context: { ticker: symbol.ticker, period } });
    chart.resetData();
    this.focusCurrent();
    this.render();
    if (opts.autoplay) this.play();
    this.emit();
    return this.state();
  }

  /** Loads older pages from the exchange until the history covers what was asked for. */
  private async ensureHistory(bars: KLineData[], ctx: ReplayContext, fromTime?: number, count?: number): Promise<KLineData[]> {
    const source = getSource(ctx.source);
    return replayHistory(bars, (before, limit) => source.fetchCandles(ctx.symbol, ctx.timeframe, { before, limit }), ctx.source === 'quantlab', fromTime, count);
  }

  step(count = 1): KLineData[] {
    const s = this.session;
    if (!s) throw new Error('Replay is not running. Start it first.');
    const revealed = s.step(count);
    for (const bar of revealed) this.options.loader.push(bar);
    if (this.follow.checked && revealed.length) this.focusCurrent();
    if (s.done) {
      this.pause();
      this.options.toast('Replay reached the latest loaded bar');
    }
    this.render();
    this.emit();
    return revealed;
  }

  play(): void {
    if (!this.session || this.timer) return;
    if (this.session.done) return;
    this.timer = setInterval(() => this.step(1), stepInterval(this.speed));
    this.render();
    this.emit();
  }

  pause(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    this.render();
    this.emit();
  }

  toggle(): void {
    if (this.timer) this.pause();
    else this.play();
  }

  setSpeed(speed: number): void {
    this.speed = replaySpeed(speed);
    this.speedSel.value = String(this.speed);
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = setInterval(() => this.step(1), stepInterval(this.speed));
    }
    this.emit();
  }

  /** Leaves replay and reloads live data. */
  stop(): void {
    this.startGeneration++;
    if (this.picking) this.endPick();
    if (!this.session) return;
    this.pause();
    this.session = null;
    this.startTime = null;
    this.options.loader.exitReplay();
    this.options.chart().resetData();
    this.render();
    this.emit();
  }

  private onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
    if (document.querySelector('.modal-backdrop:not([hidden])')) return;
    if (this.picking && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.endPick();
      return;
    }
    if (!this.session || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      this.toggle();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      this.step(1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.stop();
    }
  }

  private render(): void {
    const s = this.session;
    this.bar.hidden = s === null;
    this.position.hidden = s === null;
    if (!s) return;
    const playing = this.timer !== null;
    this.playBtn.innerHTML = playing ? ICON.pause : ICON.play;
    this.playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    this.playBtn.disabled = s.done;
    this.stepBtn.disabled = s.done;
    this.label.textContent = `${replayDate(s.current().timestamp).replace('T', ' ')} KST · ${s.remaining.toLocaleString()}봉 남음`;
    const progress = s.progress();
    const phase = s.done ? '완료' : playing ? '재생 중' : '일시정지';
    this.currentTimeLabel.textContent = `${phase} · 현재 봉 ${replayDate(s.current().timestamp).replace('T', ' ')} KST`;
    this.progressLabel.textContent = `시작 ${replayDate(this.startTime!).replace('T', ' ')} → 끝 ${replayDate(progress.endTime).replace('T', ' ')} KST · ${progress.elapsed.toLocaleString()} / ${progress.total.toLocaleString()}봉 (${progress.percent.toFixed(1)}%)`;
    this.progressBar.value = progress.percent;
  }

  private focusCurrent(): void {
    if (this.session) this.options.chart().scrollToRealTime(0);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}
