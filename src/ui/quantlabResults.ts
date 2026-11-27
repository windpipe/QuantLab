import { h } from './dom';
import './quantlabResults.css';
import type { StoredFill } from '../chart/quantlabFills';
import { createEquityChart } from './equityChart';
import { createModal } from './modal';
import baselineSource from '../script/strategies/baseline001.pine?raw';
import { currentSnapshot, runSnapshotStrategy, STRATEGY_NAMES, type ResearchStrategy } from '../script/strategyRunner';

type Row = Record<string, string>;
export interface QuantLabReport {
  summary: Record<string, unknown> & { snapshot: { revision: string }; integrity: { actual_rows: number; missing_slots: number } };
  equity: Row[];
  trades: (Row & StoredFill)[];
}

export async function fetchQuantLabReport(strategy: ResearchStrategy = 'double-b'): Promise<QuantLabReport> {
  let response = await fetch(`http://127.0.0.1:8765/backtests/btc-12m?strategy=${strategy}`, { signal: AbortSignal.timeout(30000) });
  if (response.status === 404) response = await fetch('http://127.0.0.1:8765/backtests/baseline-001', { signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json() as Promise<QuantLabReport>;
}

const number = (v: unknown, digits = 2) => v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const time = (v: string) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(Number(v));

/** Saved full-interval CPU results, independent of chart viewport and loaded pages. */
export function createQuantLabResults(onResize: () => void, onReport: (report: QuantLabReport) => void) {
  let equityChart: ReturnType<typeof createEquityChart> | null = null;
  let currentReport: QuantLabReport | null = null;
  let currentSource = baselineSource;
  let sourceModal: ReturnType<typeof createModal> | null = null;
  const showSource = () => {
    if (!sourceModal) {
      sourceModal = createModal('전략 코드 · 고급 보기', { className: 'ql-script-modal' });
      sourceModal.body.append(
        h('p', { class: 'muted' }, '선택한 결과를 만든 내부 전략 코드입니다. 일반 사용자는 전략 선택·설정·실행만 사용하면 됩니다.'),
        h('textarea', { class: 'ql-script-source', readonly: true, 'aria-label': '전략 소스', spellcheck: false }, currentSource),
        h('p', { class: 'muted' }, '복사 후 Alt+S → Editor에 붙여넣고 Ctrl+Enter로 실행합니다. 편집기는 현재 로딩된 차트 봉을 사용하며, 이 저장 리포트는 자동으로 바뀌지 않습니다.'),
      );
    }
    sourceModal.body.querySelector('textarea')!.value = currentSource;
    sourceModal.open();
  };
  const body = h('div', { class: 'ql-result-body' });
  const content = h('div');
  const strategySelect = h('select', { class: 'ql-chart-select', 'aria-label': '백테스트 전략 선택' },
    h('option', { value: 'sma' }, STRATEGY_NAMES.sma), h('option', { value: 'double-b' }, STRATEGY_NAMES['double-b']));
  strategySelect.value = 'double-b';
  const startInput = h('input', { type: 'date', value: '2025-11-24', 'aria-label': '백테스트 시작일 KST' });
  const endInput = h('input', { type: 'date', value: '2026-11-23', 'aria-label': '백테스트 종료일 KST' });
  const capitalInput = h('input', { type: 'number', value: '10000', min: '1', step: '100', 'aria-label': '초기 자본 USDT' });
  const feeInput = h('input', { type: 'number', value: '0.1', min: '0', max: '5', step: '0.01', 'aria-label': '편도 수수료 퍼센트' });
  const stopInput = h('input', { type: 'number', value: '1', min: '0.1', max: '50', step: '0.1', 'aria-label': '종가 기준 손절 퍼센트' });
  const reentryInput = h('input', { type: 'checkbox', checked: true, 'aria-label': '더블비 밴드 복귀 확인' });
  const runStatus = h('p', { class: 'ql-run-status', role: 'status' }, '최근 12개월 실측 결과를 불러옵니다. 저장 결과를 비교하거나 설정을 바꿔 실행할 수 있습니다.');
  const description = h('p', { class: 'ql-run-description' });
  const runButton = h('button', { class: 'btn btn-primary', type: 'button' }, '백테스트 실행');
  const doubleBSettings = h('div', { class: 'ql-form-row', hidden: true },
    h('label', {}, '종가 기준 손절 (%)', stopInput), h('label', { class: 'ql-chart-check' }, reentryInput, '두 밴드 안으로 종가 복귀 확인'));
  const settings = h('details', { class: 'ql-run-settings' }, h('summary', {}, '기간·자본·수수료 설정'),
    h('div', { class: 'ql-form-row' }, h('label', {}, '시작일 (KST)', startInput), h('label', {}, '종료일 포함 (KST)', endInput),
      h('label', {}, '초기 자본 (USDT)', capitalInput), h('label', {}, '편도 수수료 (%)', feeInput)), doubleBSettings);
  const describe = () => {
    const isDouble = strategySelect.value === 'double-b';
    doubleBSettings.hidden = !isDouble;
    description.textContent = isDouble
      ? '더블비 실험형: 종가 20/2 + 시가 4/4 밴드 하단 동시 터치에서 매수. 중심선 회복·상단 동시 터치·종가 손절에서 청산합니다. 현물 매수만 하며, 김직선의 공식 자동매매 전략은 아닙니다.'
      : 'SMA 5 > 20 > 60이면 매수, SMA 5 < 20 < 60이면 청산합니다. 신호 다음 봉 시가에 체결하며 공매도는 하지 않습니다.';
  };
  strategySelect.addEventListener('change', () => { describe(); runStatus.textContent = '선택한 전략을 실행하면 아래 결과와 차트 마커가 갱신됩니다.'; });
  describe();
  const savedButtons = h('div', { class: 'ql-run-toolbar' }, h('span', {}, '12개월 저장 결과'),
    ...(['sma', 'double-b'] as const).map(strategy => h('button', { class: 'ql-chart-button', onclick: () => {
      strategySelect.value = strategy; describe(); void load(strategy);
    } }, STRATEGY_NAMES[strategy])));
  body.append(savedButtons, h('div', { class: 'ql-run-toolbar' }, h('label', {}, '전략 ', strategySelect), runButton), description, settings, runStatus, content);
  const toggle = h('button', { class: 'ql-result-toggle', 'aria-expanded': 'true' }, '백테스트 · BTC/USDT 5분봉', h('span', {}, '닫기 ▾'));
  const root = h('section', { class: 'ql-results', 'aria-label': 'QuantLab 백테스트 결과' }, toggle, body);
  const render = (report: QuantLabReport) => {
    currentReport = report;
    currentSource = typeof report.summary.source_code === 'string' ? report.summary.source_code : baselineSource;
    equityChart?.destroy();
    equityChart = createEquityChart(report);
    const s = report.summary;
    const metric = (label: string, value: string, negative = false) => h('div', { class: 'ql-metric' }, h('span', {}, label), h('strong', { class: negative ? 'ql-negative' : '' }, value));
    const date = (v: unknown) => new Date(Number(v)).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
    content.replaceChildren(
      h('div', { class: 'ql-result-title' }, h('strong', {}, `${s.strategy_name ?? 'SMA 5/20/60 기준 전략'} · BTC/USDT 현물 · 5분봉`),
        h('button', { class: 'ql-chart-button', onclick: showSource }, '코드 보기 (고급)'),
        h('span', { class: 'muted' }, `${date(s.start_utc_ms)} – ${date(Number(s.end_utc_ms) - 1)} KST · 전체 요청 기간`)),
      h('div', { class: 'ql-metrics' },
        metric('최종 평가액', `${number(s.final_equity)} USDT`),
        metric('순수익률', `${number(s.net_return_pct)}%`, Number(s.net_return_pct) < 0),
        metric('최대 낙폭', `${number(s.max_drawdown_pct)}%`),
        metric('완료 거래', number(s.completed_trades, 0)),
        metric('승률', `${number(s.win_rate_pct)}%`),
        metric('Profit Factor', number(s.profit_factor, 3)),
        metric('단순 보유', `${number(s.buy_and_hold_return_pct)}%`, Number(s.buy_and_hold_return_pct) < 0),
        metric('총 수수료', `${number(s.fees_paid)} USDT`)),
      equityChart.root,
      h('p', { class: 'ql-result-note' }, `초기 ${number(s.initial_capital)} USDT · 편도 수수료 ${number(Number(s.fee_fraction_per_side) * 100)}% · 다음 봉 시가 체결 · warm-up 60봉 · 종료 미청산 평가 · 검증 ${s.integrity.actual_rows.toLocaleString()}봉 / 누락 ${s.integrity.missing_slots}봉`),
      h('details', {}, h('summary', {}, `체결 내역 ${report.trades.length}건 (KST)`),
        h('div', { class: 'ql-trades-scroll' }, h('table', { class: 'ql-trades' },
          h('thead', {}, h('tr', {}, ...['체결 시각', '매매', '가격 (USDT)', '수량 (BTC)', '수수료 (USDT)'].map((x) => h('th', {}, x)))),
          h('tbody', {}, ...report.trades.map((t) => h('tr', {}, h('td', {}, time(t.fill_time)), h('td', {}, t.side === 'BUY' ? '매수' : '매도'), h('td', {}, number(t.price)), h('td', {}, number(t.quantity, 8)), h('td', {}, number(t.fee, 4)))))))),
      h('p', { class: 'ql-result-note' }, `${s.output_kind === 'interactive' ? '설정에 따른 CPU 실행 결과' : '저장된 CPU 기준 결과'} · 스냅샷 ${s.snapshot.revision} · 차트 확대·축소와 독립 · 소수 수량, 거래소 수량 반올림 미적용`),
    );
  };
  let loadVersion = 0;
  const load = async (strategy: ResearchStrategy = 'double-b') => {
    const version = ++loadVersion;
    equityChart?.destroy();
    equityChart = null;
    content.replaceChildren(h('p', {}, '검증된 백테스트 결과를 불러오는 중…'));
    try {
      const report = await fetchQuantLabReport(strategy);
      if (version !== loadVersion) return;
      render(report);
      onReport(report);
      runStatus.textContent = `저장 결과 · ${report.summary.execution_bars}봉 · ${report.summary.completed_trades}회 완료 거래 · 실측 데이터 / 원저자 공식 자동매매 전략이 아닌 실험형`;
    } catch (error) {
      if (version !== loadVersion) return;
      content.replaceChildren(h('p', { role: 'alert' }, `결과를 불러오지 못했습니다: ${error instanceof Error ? error.message : String(error)}`),
        h('button', { class: 'btn', onclick: () => void load() }, '다시 불러오기'));
    }
  };
  runButton.addEventListener('click', async () => {
    if (!currentReport) return;
    runButton.disabled = true;
    runStatus.textContent = '선택한 기간의 고정 스냅샷으로 백테스트 중…';
    try {
      const start = Date.parse(`${startInput.value}T00:00:00+09:00`);
      const end = Date.parse(`${endInput.value}T00:00:00+09:00`) + 86400000;
      const result = await runSnapshotStrategy(await currentSnapshot(), {
        strategy: strategySelect.value as ResearchStrategy, start, end, capital: Number(capitalInput.value),
        feePercent: Number(feeInput.value), stopPercent: Number(stopInput.value), requireReentry: reentryInput.checked,
      });
      render(result); onReport(result);
      runStatus.textContent = `완료 · ${result.summary.execution_bars}봉 · ${result.summary.completed_trades}회 완료 거래 · 화면에 보이는 차트 범위와 독립적으로 계산했습니다.`;
    } catch (error) {
      runStatus.textContent = `실행 중지: ${error instanceof Error ? error.message : String(error)} 이전 결과를 유지합니다.`;
    } finally { runButton.disabled = false; }
  });
  toggle.addEventListener('click', () => {
    body.hidden = !body.hidden;
    toggle.setAttribute('aria-expanded', String(!body.hidden));
    toggle.lastElementChild!.textContent = body.hidden ? '열기 ▴' : '닫기 ▾';
    if (!body.hidden && !currentReport) void load();
    onResize();
  });
  // Load independently of the chart provider and browser-specific saved layout.
  // A fresh browser starts on Binance; that must not hide local research results.
  void load();
  return { root };
}
