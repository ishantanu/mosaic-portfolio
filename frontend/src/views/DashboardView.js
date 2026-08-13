import { Fragment, useEffect, useState } from '../react.js';
import { html } from '../react.js';
import { useApi } from '../useApi.js';
import { endpoints } from '../api.js';
import { formatMoney, formatPnL, tickerInitials } from '../format.js';
import { displayTicker, holdingIdentity, normalizeHolding } from '../normalize.js';
import { fundChargeForHolding } from '../portfolioCosts.js';
import { DIRECT_COMPANY_BY_TICKER, ETF_LOOK_THROUGH } from '../etfLookThrough.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pctStr(pnl, cost, visible) {
  if (!visible) return '••••';
  if (!cost || cost === 0) return null;
  const pct = (pnl / cost) * 100;
  return (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
}

function moneyWeightedReturn(transactions, endingValue) {
  const flows = (Array.isArray(transactions) ? transactions : [])
    .filter(item => ['DEPOSIT', 'WITHDRAWAL'].includes(String(item.type).toUpperCase()))
    .map(item => ({
      at: new Date(item.dateTime ?? item.date),
      value: String(item.type).toUpperCase() === 'DEPOSIT' ? -Math.abs(Number(item.amount)) : Math.abs(Number(item.amount)),
    }))
    .filter(flow => Number.isFinite(flow.value) && !Number.isNaN(flow.at.valueOf()))
    .sort((a, b) => a.at - b.at);
  if (flows.length === 0 || !Number.isFinite(endingValue) || endingValue <= 0) return null;

  const end = new Date();
  flows.push({ at: end, value: endingValue });
  const first = flows[0].at.valueOf();
  const npv = rate => flows.reduce((sum, flow) => {
    const years = (flow.at.valueOf() - first) / 86400000 / 365.25;
    return sum + flow.value / Math.pow(1 + rate, years);
  }, 0);

  let rate = 0.1;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const value = npv(rate);
    const slope = (npv(rate + 0.00001) - value) / 0.00001;
    if (!Number.isFinite(slope) || Math.abs(slope) < 1e-9) break;
    const next = rate - value / slope;
    if (!Number.isFinite(next) || next <= -0.999 || next > 1000) break;
    if (Math.abs(next - rate) < 1e-8) { rate = next; break; }
    rate = next;
  }
  if (Math.abs(npv(rate)) > 0.01) return null;

  const days = Math.max(1, (end.valueOf() - first) / 86400000);
  return { rate: (Math.pow(1 + rate, days / 365.25) - 1) * 100, days };
}

function yearToDateReturn(transactions, endingValue) {
  const start = new Date(new Date().getFullYear(), 0, 1).valueOf();
  const netDeposits = (Array.isArray(transactions) ? transactions : [])
    .filter(item => new Date(item.dateTime ?? item.date).valueOf() >= start)
    .reduce((total, item) => {
      const type = String(item.type).toUpperCase();
      const amount = Math.abs(Number(item.amount) || 0);
      if (type === 'DEPOSIT') return total + amount;
      if (type === 'WITHDRAWAL') return total - amount;
      return total;
    }, 0);
  return netDeposits > 0 && Number.isFinite(endingValue)
    ? ((endingValue - netDeposits) / netDeposits) * 100
    : null;
}

function contributionPace(transactions) {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1).valueOf();
  const thirtyDaysAgo = now.valueOf() - 30 * 86400000;
  const netContributions = from => (Array.isArray(transactions) ? transactions : []).reduce((total, item) => {
    if (new Date(item.dateTime ?? item.date).valueOf() < from) return total;
    const amount = Math.abs(Number(item.amount) || 0);
    const type = String(item.type).toUpperCase();
    return type === 'DEPOSIT' ? total + amount : type === 'WITHDRAWAL' ? total - amount : total;
  }, 0);
  const ytd = netContributions(yearStart);
  const daysElapsed = Math.max(1, (now.valueOf() - yearStart) / 86400000);
  return { last30: netContributions(thirtyDaysAgo), ytd, annualised: (ytd / daysElapsed) * 365.25 };
}

function portfolioValueJourney(transactions, currentValue) {
  const flows = (Array.isArray(transactions) ? transactions : []).reduce((result, item) => {
    const amount = Math.abs(Number(item.amount) || 0);
    const type = String(item.type).toUpperCase();
    if (type === 'DEPOSIT') result.deposits += amount;
    if (type === 'WITHDRAWAL') result.withdrawals += amount;
    return result;
  }, { deposits: 0, withdrawals: 0 });
  const netContributions = flows.deposits - flows.withdrawals;
  return { ...flows, netContributions, growth: currentValue - netContributions };
}

function brokerBreakdown(holdings) {
  const grouped = (Array.isArray(holdings) ? holdings : []).reduce((brokers, holding) => {
    const item = normalizeHolding(holding);
    const name = item.broker || 'Unattributed account';
    const current = brokers.get(name) ?? { name, value: 0, cost: 0, positions: 0 };
    current.value += Number(item.curValue) || 0;
    current.cost += Number(holding.costBasis ?? holding.walletImpact?.totalCost ?? item.avgPrice * item.qty) || 0;
    current.positions += 1;
    brokers.set(name, current);
    return brokers;
  }, new Map());
  const total = [...grouped.values()].reduce((sum, broker) => sum + broker.value, 0);
  return [...grouped.values()]
    .map(broker => ({ ...broker, pnl: broker.value - broker.cost, allocation: total ? broker.value / total * 100 : 0 }))
    .sort((left, right) => right.value - left.value);
}

function isaAllowanceUsage(transactions) {
  const now = new Date();
  const year = now.getFullYear();
  const taxYearStart = now < new Date(year, 3, 6) ? new Date(year - 1, 3, 6) : new Date(year, 3, 6);
  const taxYearEnd = new Date(taxYearStart.getFullYear() + 1, 3, 5, 23, 59, 59, 999);
  const subscriptions = (Array.isArray(transactions) ? transactions : []).reduce((total, item) => {
    const date = new Date(item.dateTime ?? item.date);
    if (date < taxYearStart || date > taxYearEnd || String(item.type).toUpperCase() !== 'DEPOSIT') return total;
    return total + Math.abs(Number(item.amount) || 0);
  }, 0);
  return {
    limit: 20000,
    used: subscriptions,
    remaining: Math.max(0, 20000 - subscriptions),
    percent: Math.min(100, (subscriptions / 20000) * 100),
    label: taxYearStart.getFullYear() + '/' + String(taxYearStart.getFullYear() + 1).slice(-2),
  };
}

const MAX_SNAPSHOTS = 2000;
const TIME_RANGES = [
  ['1d', '1D'], ['2d', '2D'], ['3d', '3D'], ['1w', '1W'], ['1m', '1M'], ['3m', '3M'],
  ['6m', '6M'], ['1y', '1Y'], ['2y', '2Y'], ['3y', '3Y'], ['4y', '4Y'], ['5y', '5Y'],
];
const EXPOSURE_COLOURS = ['#247d8a', '#6d4c8f', '#b6812d', '#167a59', '#496f96'];
const HOLDINGS_PAGE_SIZE = 10;
const PORTFOLIO_POLICY_KEY = 'mosaic:portfolio-policy-v1';
const ISA_CASH_RATE_KEY = 'mosaic:isa-cash-rate-v1';
const DEFAULT_PORTFOLIO_POLICY = {
  companyExposure: 10,
  topThreeExposure: 50,
  annualFundCost: 0.5,
  cashAllocation: 5,
  freshnessSeconds: 60,
};

function readPortfolioPolicy() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(PORTFOLIO_POLICY_KEY) || '{}');
    return { ...DEFAULT_PORTFOLIO_POLICY, ...stored };
  } catch {
    return DEFAULT_PORTFOLIO_POLICY;
  }
}

function pointTime(point) {
  return point.at ?? point.timestamp ?? point.date ?? point.time ?? null;
}

function pointValue(point, keys) {
  for (const key of keys) {
    const value = Number(point?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function rangeStart(range) {
  const match = /^(\d+)([dwmy])$/.exec(range);
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = match[2];
  const start = new Date();
  if (unit === 'd') start.setDate(start.getDate() - amount);
  if (unit === 'w') start.setDate(start.getDate() - amount * 7);
  if (unit === 'm') start.setMonth(start.getMonth() - amount);
  if (unit === 'y') start.setFullYear(start.getFullYear() - amount);
  return start.valueOf();
}

function pointsInRange(points, range) {
  const start = rangeStart(range);
  return points.filter(point => new Date(point.at).valueOf() >= start);
}

function buildSeries(history, savedSnapshots, keys, range) {
  const points = Array.isArray(history) ? history : [];
  return pointsInRange([...points, ...savedSnapshots]
    .map(point => ({ at: pointTime(point), value: pointValue(point, keys) }))
    .filter(point => point.at && point.value != null)
    .sort((a, b) => new Date(a.at) - new Date(b.at))
    .filter((point, index, values) => index === 0 || point.at !== values[index - 1].at), range)
    .slice(-MAX_SNAPSHOTS);
}

function chartDate(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.valueOf())
    ? 'Now'
    : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date);
}

function effectiveCompanyExposure(holdings, total) {
  const entries = new Map();
  holdings.forEach(holding => {
    const value = normalizeHolding(holding);
    const weight = total > 0 ? value.curValue / total * 100 : 0;
    const ticker = displayTicker(value.ticker).toUpperCase();
    const company = DIRECT_COMPANY_BY_TICKER[ticker];
    if (company) entries.set(company, (entries.get(company) ?? 0) + weight);
    const fund = ETF_LOOK_THROUGH[ticker];
    fund?.holdings.forEach(component => entries.set(component.company, (entries.get(component.company) ?? 0) + weight * component.weight / 100));
  });
  return [...entries.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((left, right) => right.value - left.value)[0] ?? null;
}

function PortfolioHealthPanel({ holdings, invested, portfolioValue, cash, terOcf, summary, visible }) {
  const [policy, setPolicy] = useState(readPortfolioPolicy);
  const [editing, setEditing] = useState(false);
  const topThree = [...holdings].sort((left, right) => normalizeHolding(right).curValue - normalizeHolding(left).curValue)
    .slice(0, 3).reduce((total, holding) => total + normalizeHolding(holding).curValue, 0);
  const company = effectiveCompanyExposure(holdings, invested);
  const lastSynced = new Date(summary?.lastSynced).valueOf();
  const freshness = Number.isFinite(lastSynced) ? Math.max(0, Math.round((Date.now() - lastSynced) / 1000)) : null;
  const metrics = [
    { key: 'companyExposure', label: 'Effective company exposure', target: policy.companyExposure, actual: company?.value ?? null, subject: company?.name ?? 'No mapped company', unit: '%', type: 'percent' },
    { key: 'topThreeExposure', label: 'Top-three concentration', target: policy.topThreeExposure, actual: invested > 0 ? topThree / invested * 100 : null, subject: 'Largest three holdings', unit: '%', type: 'percent' },
    { key: 'annualFundCost', label: 'Annual fund cost', target: policy.annualFundCost, actual: terOcf == null ? null : terOcf, subject: 'Weighted TER / OCF', unit: '%', type: 'percent' },
    { key: 'cashAllocation', label: 'Cash drag', target: policy.cashAllocation, actual: portfolioValue > 0 ? cash / portfolioValue * 100 : null, subject: 'Cash as portfolio value', unit: '%', type: 'percent' },
    { key: 'freshnessSeconds', label: 'Valuation freshness', target: policy.freshnessSeconds, actual: freshness, subject: freshness == null ? 'No broker timestamp' : 'Trading 212 valuation', unit: 's', type: 'seconds' },
  ];
  const updatePolicy = (key, value) => {
    const next = { ...policy, [key]: Math.max(0, Number(value) || 0) };
    setPolicy(next);
    window.localStorage.setItem(PORTFOLIO_POLICY_KEY, JSON.stringify(next));
  };
  const breaches = metrics.filter(metric => metric.actual != null && metric.actual > metric.target).length;

  return html`<section class="portfolio-health card">
    <div class="card-header">
      <div><div class="chart-title-row"><div class="card-title">Portfolio health</div><${PanelInfo} text="Portfolio health compares your current portfolio with guardrails you control. It is an information tool, not a personal recommendation to buy, sell or hold an investment." /></div><div class="card-subtitle">Your policy guardrails, remaining error budget and data freshness</div></div>
      <div class="health-header-actions"><span class=${'health-summary ' + (breaches ? 'at-risk' : 'healthy')}>${breaches ? `${breaches} guardrail${breaches === 1 ? '' : 's'} breached` : 'Within policy'}</span><button type="button" class="effective-sort-button" onClick=${() => setEditing(current => !current)}>${editing ? 'Done' : 'Edit guardrails'}</button></div>
    </div>
    <div class="health-grid">
      ${metrics.map(metric => {
        const known = metric.actual != null;
        const delta = known ? metric.target - metric.actual : null;
        const state = !known ? 'unknown' : delta >= 0 ? 'healthy' : 'breached';
        const actualText = !visible ? '••••' : !known ? '—' : `${metric.actual.toFixed(metric.type === 'seconds' ? 0 : 1)}${metric.unit}`;
        const budgetText = !visible ? '••••' : !known ? 'Awaiting data' : delta >= 0 ? `${delta.toFixed(metric.type === 'seconds' ? 0 : 1)}${metric.unit} remaining` : `${Math.abs(delta).toFixed(metric.type === 'seconds' ? 0 : 1)}${metric.unit} over limit`;
        return html`<article class=${'health-slo ' + state} key=${metric.key}>
          <div class="health-slo-top"><span>${metric.label}</span><b>${state === 'healthy' ? 'Healthy' : state === 'breached' ? 'Breached' : 'Awaiting data'}</b></div>
          <strong>${actualText}</strong><small>${metric.subject}</small><div class="health-budget">${budgetText}</div>
          ${editing ? html`<label class="health-target">Target ≤ <input type="number" min="0" step=${metric.type === 'seconds' ? '1' : '0.1'} value=${metric.target} onInput=${event => updatePolicy(metric.key, event.target.value)} />${metric.unit}</label>` : html`<div class="health-target">Target ≤ ${metric.target}${metric.unit}</div>`}
        </article>`;
      })}
    </div>
    <div class="health-note">Reference guardrails are editable and apply only to this dashboard. They are not a suitability assessment or investment advice.</div>
  </section>`;
}

function RangePicker({ range, onChange }) {
  return html`<div class="chart-range" aria-label="Chart time range">
    ${TIME_RANGES.map(([value, label]) => html`
      <button key=${value} class=${'chart-range-button' + (range === value ? ' active' : '')} onClick=${() => onChange(value)}>${label}</button>`)}
  </div>`;
}

function DurationSelect({ range, onChange, label = 'Chart time period' }) {
  return html`<label class="chart-duration-select">
    <span>Period</span>
    <select value=${range} onChange=${event => onChange(event.target.value)} aria-label=${label}>
      ${TIME_RANGES.map(([value, label]) => html`<option key=${value} value=${value}>${label}</option>`)}
    </select>
  </label>`;
}

function PanelInfo({ text }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const tooltipId = `panel-info-${text.slice(0, 18).replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
  const show = event => {
    const rect = event.currentTarget.getBoundingClientRect();
    setPosition({ top: rect.bottom + 8, left: Math.max(150, Math.min(rect.left + rect.width / 2, window.innerWidth - 170)) });
    setOpen(true);
  };
  return html`<span class="panel-info-wrap">
    <button type="button" class="panel-info" aria-label="More information" aria-describedby=${open ? tooltipId : undefined} onMouseEnter=${show} onMouseLeave=${() => setOpen(false)} onFocus=${show} onBlur=${() => setOpen(false)}>i</button>
    ${open ? html`<span id=${tooltipId} role="tooltip" class="panel-info-tooltip" style=${{ top: `${position.top}px`, left: `${position.left}px` }}>${text}</span>` : null}
  </span>`;
}

function PortfolioValueChart({ valueText, periodChange, currency, points, visible, emptyText, range, onRangeChange }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const frame = { left: 44, right: 8, top: 12, bottom: 28, width: 420, height: 176 };
  const chartStart = rangeStart(range);
  const chartEnd = Date.now();
  const values = points.map(point => point.value);
  const lowest = values.length ? Math.min(...values) : 0;
  const highest = values.length ? Math.max(...values) : 0;
  const valueSpan = Math.max(1, highest - lowest, Math.abs(highest) * 0.01);
  const yMin = lowest - valueSpan * 0.08;
  const yMax = highest + valueSpan * 0.08;
  const xFor = timestamp => frame.left + (frame.width - frame.left - frame.right) * Math.max(0, Math.min(1, (new Date(timestamp).valueOf() - chartStart) / Math.max(1, chartEnd - chartStart)));
  const yFor = value => frame.top + (yMax - value) / Math.max(1, yMax - yMin) * (frame.height - frame.top - frame.bottom);
  const coordinates = points.map(point => ({ ...point, x: xFor(point.at), y: yFor(point.value) }));
  const path = coordinates.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const baseY = frame.height - frame.bottom;
  const area = coordinates.length > 1 ? `${path} L ${coordinates.at(-1).x} ${baseY} L ${coordinates[0].x} ${baseY} Z` : '';
  const timeTicks = [0, .25, .5, .75, 1].map(fraction => chartStart + (chartEnd - chartStart) * fraction);
  const valueTicks = [yMax, (yMax + yMin) / 2, yMin];
  const trendClass = periodChange > 0 ? 'gain' : periodChange < 0 ? 'loss' : 'neutral';
  const hoveredPoint = hoverIndex == null ? null : coordinates[hoverIndex];
  const compactValue = value => new Intl.NumberFormat('en-GB', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(value);

  return html`<section class="chart-panel portfolio-value-chart">
    <div class="chart-header"><div><div class="chart-title-row"><div class="chart-title">Portfolio value over time</div><${PanelInfo} text="Shows the portfolio value supplied by your broker at each recorded snapshot. It is a history of actual captured values, not a reconstructed price chart. A line can rise or fall with markets, cash flows and foreign-exchange movements." /></div><div class=${'chart-meta ' + trendClass}>${points.length > 1 && visible ? `${periodChange >= 0 ? '+' : ''}${formatMoney(periodChange, currency, true)} in selected period` : 'Broker-valued snapshots'}</div></div><div class="chart-kpi">${valueText}</div></div>
    <div class="chart-controls chart-duration-controls"><${DurationSelect} range=${range} onChange=${onRangeChange} label="Portfolio value period" /></div>
    <div class="chart-body">
      ${coordinates.length < 2 ? html`<div class="chart-empty">${coordinates.length ? 'First broker-valued snapshot recorded. The chart will draw after the next snapshot.' : emptyText}</div>` : html`<svg class="chart-svg" viewBox="0 0 420 176" role="img" aria-label="Portfolio value over time" onMouseLeave=${() => setHoverIndex(null)}>
        ${valueTicks.map(value => html`<g key=${value}><line class="chart-grid-line" x1=${frame.left} x2=${frame.width - frame.right} y1=${yFor(value)} y2=${yFor(value)} /><text class="chart-axis-label" x="0" y=${yFor(value) + 3}>${compactValue(value)}</text></g>`)}
        <line class="chart-x-axis" x1=${frame.left} x2=${frame.width - frame.right} y1=${baseY} y2=${baseY} />
        <path class=${'chart-area-fill ' + trendClass + '-fill'} d=${area} />
        <path class=${'chart-line ' + trendClass + '-line'} d=${path} />
        ${timeTicks.map(tick => html`<g key=${tick}><line class="chart-tick" x1=${xFor(tick)} x2=${xFor(tick)} y1=${baseY} y2=${baseY + 5} /><text class="chart-axis-label" x=${xFor(tick)} y="172" text-anchor=${tick === timeTicks[0] ? 'start' : tick === timeTicks.at(-1) ? 'end' : 'middle'}>${rangeTickLabel(tick, range)}</text></g>`)}
        ${coordinates.map((point, index) => {
          const left = index === 0 ? frame.left : (coordinates[index - 1].x + point.x) / 2;
          const right = index === coordinates.length - 1 ? frame.width - frame.right : (point.x + coordinates[index + 1].x) / 2;
          return html`<rect key=${point.at} class="chart-hover-zone" x=${left} y=${frame.top} width=${Math.max(8, right - left)} height=${baseY - frame.top} onMouseEnter=${() => setHoverIndex(index)} />`;
        })}
        ${hoveredPoint ? html`<line class="chart-crosshair" x1=${hoveredPoint.x} x2=${hoveredPoint.x} y1=${frame.top} y2=${baseY} /><circle class=${'chart-dot active ' + trendClass + '-dot'} cx=${hoveredPoint.x} cy=${hoveredPoint.y} />` : null}
      </svg>`}
      ${hoveredPoint ? html`<div class=${'chart-tooltip ' + (hoveredPoint.x < 115 ? 'edge-start' : hoveredPoint.x > 305 ? 'edge-end' : '') + (hoveredPoint.y < 55 ? ' below-point' : '')} style=${{ left: `${hoveredPoint.x / frame.width * 100}%`, top: `${hoveredPoint.y / frame.height * 100}%` }}><div class="chart-tooltip-label">${chartDate(hoveredPoint.at)}</div><div class="chart-tooltip-value">${formatMoney(hoveredPoint.value, currency, visible)}</div></div>` : null}
    </div>
  </section>`;
}

const SECTOR_BY_TICKER = {
  VWRPL_EQ: 'Global equity ETFs', WLDSL_EQ: 'Global equity ETFs',
  SSLNL_EQ: 'Precious metals', SGLNL_EQ: 'Precious metals',
  RPIL_EQ: 'Technology', SEMIL_EQ: 'Semiconductors',
  UKWL_EQ: 'Renewable energy', BARCL_EQ: 'Financials',
  GOOGL_US_EQ: 'Communication services', AZNL_EQ: 'Healthcare',
};
function sectorForHolding(holding) {
  const { ticker } = normalizeHolding(holding);
  return holding.sector ?? holding.instrument?.sector
    ?? SECTOR_BY_TICKER[ticker.toUpperCase()]
    ?? 'Other equities';
}

function rangeTickLabel(timestamp, range) {
  if (/^\d+d$/.test(range)) {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
  }
  if (range === '1w') {
    return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric' }).format(new Date(timestamp));
  }
  return new Intl.DateTimeFormat('en-GB', range.endsWith('y')
    ? { month: 'short', year: '2-digit' }
    : { day: 'numeric', month: 'short' },
  ).format(new Date(timestamp));
}

function OrdersBarChart({ orders, range, onRangeChange, visible, currency }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const grouped = (Array.isArray(orders) ? orders : [])
    .map(item => {
      const order = item.order ?? item;
      const fill = item.fill ?? {};
      const at = fill.filledAt ?? order.filledAt ?? order.createdAt;
      const rawValue = Number(order.filledValue) || Number(order.value) || (Number(fill.price) * Number(fill.quantity));
      const value = Math.abs(rawValue) / (order.instrument?.currency === 'GBX' ? 100 : 1);
      const isSell = String(order.side ?? order.type).toUpperCase() === 'SELL';
      return { at, value: isSell ? -value : value };
    })
    .filter(item => item.at && item.value)
    .filter(item => new Date(item.at).valueOf() >= rangeStart(range))
    .reduce((days, item) => {
      const day = new Date(item.at).toISOString().slice(0, 10);
      days[day] = (days[day] ?? 0) + item.value;
      return days;
    }, {});
  const bars = Object.entries(grouped).map(([day, value]) => ({ at: day, value })).sort((a, b) => new Date(a.at) - new Date(b.at));
  const max = Math.max(1, ...bars.map(bar => Math.abs(bar.value)));
  const start = rangeStart(range);
  const end = Date.now();
  const span = Math.max(1, end - start);
  const xFor = date => 8 + Math.max(0, Math.min(1, (new Date(date).valueOf() - start) / span)) * 404;
  const barPositions = bars.map(bar => xFor(bar.at));
  const nearestGap = barPositions.length > 1
    ? Math.min(...barPositions.slice(1).map((position, index) => position - barPositions[index]))
    : 12;
  const barWidth = Math.max(3, Math.min(12, nearestGap * 0.68));
  const ticks = [0, .25, .5, .75, 1].map(fraction => start + span * fraction);
  const hovered = hoverIndex == null ? null : bars[hoverIndex];
  const rangeLabel = TIME_RANGES.find(([value]) => value === range)?.[1] ?? range.toUpperCase();
  const orderDayLabel = `${bars.length} order ${bars.length === 1 ? 'day' : 'days'}`;
  const buyValue = bars.reduce((total, bar) => total + (bar.value > 0 ? bar.value : 0), 0);
  const sellValue = Math.abs(bars.reduce((total, bar) => total + (bar.value < 0 ? bar.value : 0), 0));
  const netFlow = buyValue - sellValue;
  const tooltipEdge = hovered && xFor(hovered.at) < 70
    ? 'edge-start'
    : hovered && xFor(hovered.at) > 350 ? 'edge-end' : '';

  return html`<section class="chart-panel orders-chart">
    <div class="chart-header"><div><div class="chart-title-row"><div class="chart-title">Orders placed over time</div><${PanelInfo} text="Shows the value of filled buy and sell orders on each trading day. It is activity, not portfolio performance." /></div><div class="chart-meta">${orderDayLabel} · Buys ${formatMoney(buyValue, currency, visible)} · Sells ${formatMoney(sellValue, currency, visible)}</div></div><div><div class=${'chart-kpi ' + (netFlow > 0 ? 'gain' : netFlow < 0 ? 'loss' : '')}>${formatMoney(netFlow, currency, visible)}</div><div class="chart-kpi-label">Net order flow</div></div></div>
    <div class="chart-controls chart-duration-controls"><${DurationSelect} range=${range} onChange=${onRangeChange} /></div>
    <div class="chart-body">
      ${bars.length === 0 ? html`<div class="chart-empty">No filled orders in this period.</div>` : html`<svg class="chart-svg" viewBox="0 0 420 176" role="img" aria-label="Orders placed over time" onMouseLeave=${() => setHoverIndex(null)}>
        <line class="chart-x-axis" x1="8" x2="412" y1="83" y2="83" />
        ${ticks.map(tick => html`<g key=${tick}><line class="chart-tick" x1=${xFor(tick)} x2=${xFor(tick)} y1="83" y2="88" /><text class="chart-axis-label" x=${xFor(tick)} y="172" text-anchor=${tick === ticks[0] ? 'start' : tick === ticks.at(-1) ? 'end' : 'middle'}>${rangeTickLabel(tick, range)}</text></g>`)}
        ${bars.map((bar, index) => {
          const height = Math.max(2, Math.abs(bar.value / max) * 64);
          const x = xFor(bar.at) - barWidth / 2;
          const y = bar.value >= 0 ? 83 - height : 83;
          return html`<rect key=${bar.at} class=${'order-bar ' + (bar.value >= 0 ? 'buy' : 'sell')} x=${x} y=${y} width=${barWidth} height=${height} onMouseEnter=${() => setHoverIndex(index)} />`;
        })}
      </svg>`}
      <div class="order-chart-key"><span class="buy"><i></i>Buy</span><span class="sell"><i></i>Sell</span></div>
      ${hovered ? html`<div class=${'chart-tooltip ' + tooltipEdge} style=${{ left: `${xFor(hovered.at) / 420 * 100}%`, top: hovered.value >= 0 ? '30%' : '72%' }}><div class="chart-tooltip-label">${chartDate(hovered.at)} · ${hovered.value >= 0 ? 'Buy' : 'Sell'}</div><div class="chart-tooltip-value">${formatMoney(Math.abs(hovered.value), currency, visible)}</div></div>` : null}
    </div>
  </section>`;
}

function pieSlice(cx, cy, radius, start, end) {
  const point = angle => [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  const [startX, startY] = point(start);
  const [endX, endY] = point(end);
  const largeArc = end - start > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY} Z`;
}

function SectorPieChart({ holdings, visible, currency, pace }) {
  const [activeSector, setActiveSector] = useState(null);
  const total = holdings.reduce((sum, holding) => sum + normalizeHolding(holding).curValue, 0);
  const sectors = Object.entries(holdings.reduce((groups, holding) => {
    const sector = sectorForHolding(holding);
    groups[sector] = (groups[sector] ?? 0) + normalizeHolding(holding).curValue;
    return groups;
  }, {}))
    .map(([name, value]) => ({ name, value, pct: total > 0 ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
  let angle = -Math.PI / 2;
  const slices = sectors.map((sector, index) => {
    const start = angle;
    angle += (sector.value / Math.max(total, 1)) * Math.PI * 2;
    return { ...sector, index, start, end: angle };
  });
  const active = activeSector == null ? null : slices[activeSector];

  return html`
    <section class="chart-panel sector-panel">
      <div class="chart-header">
        <div>
          <div class="chart-title-row"><div class="chart-title">Sector exposure</div><${PanelInfo} text="Shows the current invested value split by sector. Contribution pace uses your dated deposits and withdrawals to summarise how consistently you are adding money." /></div>
          <div class="chart-meta">Current invested value by sector</div>
        </div>
        <div class="chart-kpi">${visible ? sectors.length : '••••'} sectors</div>
      </div>
      <div class="sector-body">
        ${slices.length === 0
          ? html`<div class="chart-empty">Sector exposure will appear once holdings are available.</div>`
          : html`<div class="sector-pie-wrap">
              <svg class="sector-pie" viewBox="0 0 208 176" role="img" aria-label="Sector exposure pie chart">
                ${slices.map(slice => html`<path key=${slice.name} class=${'sector-slice' + (activeSector === slice.index ? ' active' : '')} d=${pieSlice(88, 88, 68, slice.start, slice.end)} fill=${EXPOSURE_COLOURS[slice.index % EXPOSURE_COLOURS.length]} onMouseEnter=${() => setActiveSector(slice.index)} onMouseLeave=${() => setActiveSector(null)} />`)}
                <circle cx="88" cy="88" r="38" fill="var(--bg-card)" />
                <text class="sector-pie-total" x="88" y="84" text-anchor="middle">${visible ? formatMoney(total, currency, true) : '••••'}</text>
                <text class="sector-pie-label" x="88" y="100" text-anchor="middle">Invested</text>
              </svg>
              <div class="sector-legend">
                ${slices.map(slice => html`<button key=${slice.name} class=${activeSector === slice.index ? 'active' : ''} onMouseEnter=${() => setActiveSector(slice.index)} onMouseLeave=${() => setActiveSector(null)}>
                  <i style=${{ background: EXPOSURE_COLOURS[slice.index % EXPOSURE_COLOURS.length] }}></i>
                  <span>${slice.name}</span><strong>${visible ? slice.pct.toFixed(1) + '%' : '••••'}</strong>
                </button>`)}
                ${pace ? html`<div class="contribution-insight">
                  <strong>Contribution pace</strong>
                  <span>${visible ? formatMoney(pace.last30, currency, true) : '••••'} in the past 30 days · ${visible ? formatMoney(pace.ytd, currency, true) : '••••'} YTD</span>
                  <span>Projected annual contributions: ${visible ? formatMoney(pace.annualised, currency, true) : '••••'}.</span>
                </div>` : null}
              </div>
            </div>`}
        ${active ? html`<div class="chart-tooltip sector-tooltip"><div class="chart-tooltip-label">${active.name}</div><div class="chart-tooltip-value">${formatMoney(active.value, currency, visible)} · ${active.pct.toFixed(1)}%</div></div>` : null}
      </div>
    </section>`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, meta, variant, info }) {
  const cardCls  = 'stat-card'  + (variant ? ' ' + variant : '');
  const valueCls = 'stat-value' + (variant ? ' ' + variant : '');
  return html`
    <div class=${cardCls}>
      <div class="stat-label-row"><div class="stat-label">${label}</div>${info ? html`<${PanelInfo} text=${info} />` : null}</div>
      <div class=${valueCls}>${value}</div>
      ${meta ? html`<div class="stat-meta">${meta}</div>` : null}
    </div>`;
}

function StatCardSkeleton() {
  return html`
    <div class="stat-card">
      <div class="stat-label"><span class="skeleton skeleton-block sm"></span></div>
      <div class="stat-value"><span class="skeleton skeleton-block lg"></span></div>
    </div>`;
}

function HoldingRow({ holding, visible }) {
  const {
    ticker, name, qty, curPrice, curValue, currency, instrumentCurrency, broker, pnlRaw, isForeignCurrency, impliedEntryFxRate, impliedFxRate,
  } = normalizeHolding(holding);
  const listedTicker = displayTicker(ticker);

  // costBasis comes directly from the portfolio holdings object
  const costBasis = holding.costBasis ?? null;
  const { text: pnlText, cls: pnlCls } = formatPnL(pnlRaw, currency, visible);
  const pct = pctStr(pnlRaw, costBasis, visible);
  const tdCls = 'text-right mono' + (pnlCls ? ' ' + pnlCls : '');
  const ongoingCharge = fundChargeForHolding(holding);

  return html`
    <tr>
      <td>
        <div class="ticker-cell">
          <div class="ticker-avatar">${tickerInitials(listedTicker)}</div>
          <div>
            <div class="ticker-name">${name}</div>
            <div class="ticker-sub">${listedTicker} · ${formatMoney(curPrice, instrumentCurrency, visible)} per share · ${instrumentCurrency} quote${broker ? ` · ${broker}` : ''}</div>
            ${isForeignCurrency ? html`<div class="ticker-sub">${visible ? `FX rate: ${formatMoney(impliedEntryFxRate, currency, true)}/${instrumentCurrency} at entry · ${formatMoney(impliedFxRate, currency, true)}/${instrumentCurrency} now` : '••••'}</div>` : null}
          </div>
        </div>
      </td>
      <td class="text-right mono">${visible ? String(qty) : '••••'}</td>
      <td class="text-right mono">${formatMoney(curValue, currency, visible)}</td>
      <td class="text-right mono">${visible ? (ongoingCharge == null ? '—' : ongoingCharge.toFixed(2) + '%') : '••••'}</td>
      <td class=${tdCls}>
        <div>${pnlText}</div>
        ${pct ? html`<div class=${'ticker-sub ' + pnlCls}>${pct}</div>` : null}
      </td>
    </tr>`;
}

function SortableHeader({ label, sortKey, activeKey, direction, onSort, alignRight = true }) {
  const active = activeKey === sortKey;
  const indicator = active ? (direction === 'asc' ? '↑' : '↓') : '↕';
  return html`<th class=${alignRight ? 'text-right' : ''} aria-sort=${active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
    <button class=${'table-sort-button' + (active ? ' active' : '')} onClick=${() => onSort(sortKey)}>${label}<span aria-hidden="true">${indicator}</span></button>
  </th>`;
}

function holdingPnLPercentage(holding) {
  const normalized = normalizeHolding(holding);
  const costBasis = Number(holding.costBasis ?? holding.walletImpact?.totalCost ?? (normalized.avgPrice * normalized.qty));
  return costBasis > 0 ? (normalized.pnlRaw / costBasis) * 100 : Number.NEGATIVE_INFINITY;
}

// Renders the four KPI cards — always returns exactly ONE root element
function KpiSection({ loading, error, summary, pnlNum, pnlPct, currency, visible, terOcf }) {
  if (loading) {
    return html`
      <${Fragment}>
        ${[0, 1, 2, 3, 4].map(index => html`<${StatCardSkeleton} key=${index} />`)}
      </${Fragment}>`;
  }
  if (error) {
    return html`
      <div class="stat-card" style=${{ gridColumn: '1 / -1' }}>
        <div class="state-container" style=${{ padding: '24px' }}>
          <div class="state-icon">⚠</div>
          <div class="state-title">Could not load account summary</div>
          <div class="state-body">${error}</div>
        </div>
      </div>`;
  }

  const pnlVariant  = pnlNum > 0 ? 'gain' : pnlNum < 0 ? 'loss' : '';
  const { text: pnlText } = formatPnL(pnlNum, currency, visible);
  const pnlMeta = pnlPct != null
    ? (visible ? pnlPct + ' vs. cost basis' : '•••• vs. cost basis')
    : 'vs. cost basis';

  return html`
    <${Fragment}>
      <${StatCard} label="Total Portfolio Value" value=${formatMoney(summary?.totalValue, currency, visible)} meta="Invested + cash" variant="portfolio" info="The current value of investments plus available cash in the account." />
      <${StatCard} label="Available Cash"        value=${formatMoney(summary?.cash,       currency, visible)} meta="Ready to invest" variant="cash" info="Cash currently available to trade. It does not include the value of open investments." />
      <${StatCard} label="Invested Value"        value=${formatMoney(summary?.balance ?? summary?.totalValue, currency, visible)} meta="Current market value" variant="invested" info="The current market value of open holdings, excluding available cash." />
      <${StatCard} label="Weighted TER / OCF"    value=${visible ? (terOcf == null ? '—' : terOcf.toFixed(2) + '%') : '••••'} meta=${terOcf == null ? 'Fund costs not supplied by broker' : 'Ongoing fund charges'} variant="cost" info="The market-value-weighted annual ongoing charge for fund and ETC holdings. Direct shares carry no ongoing fund charge." />
      <${StatCard} label="Unrealised P&L" value=${pnlText} meta=${pnlMeta} variant=${pnlVariant} info="The current gain or loss on open positions. It excludes realised gains or losses from positions already sold." />
    </${Fragment}>`;
}

function BrokerAllocationPanel({ brokers, currency, visible }) {
  if (brokers.length < 2) return null;
  return html`<section class="broker-allocation-panel card">
    <div class="card-header">
      <div><div class="chart-title-row"><div class="card-title">Connected account split</div><${PanelInfo} text="Shows invested value and unrealised P/L by linked broker. Values are aggregated in your Mosaic base currency; cash is excluded until each broker provides account-level cash balances." /></div><div class="card-subtitle">How your invested assets are distributed across ${brokers.length} brokers</div></div>
      <span class="broker-allocation-total">${visible ? formatMoney(brokers.reduce((sum, broker) => sum + broker.value, 0), currency, true) : '••••'}</span>
    </div>
    <div class="broker-allocation-grid">
      ${brokers.map(broker => html`<div class="broker-allocation-item" key=${broker.name}>
        <div class="broker-allocation-name"><i></i><strong>${broker.name}</strong><span>${broker.positions} position${broker.positions === 1 ? '' : 's'}</span></div>
        <div class="broker-allocation-values"><div><span>Invested value</span><strong>${formatMoney(broker.value, currency, visible)}</strong></div><div><span>Unrealised P/L</span><strong class=${broker.pnl > 0 ? 'gain' : broker.pnl < 0 ? 'loss' : ''}>${formatPnL(broker.pnl, currency, visible).text}</strong></div><div><span>Allocation</span><strong>${visible ? broker.allocation.toFixed(1) + '%' : '••••'}</strong></div></div>
        <div class="broker-allocation-track"><i style=${{ width: broker.allocation + '%' }}></i></div>
      </div>`)}
    </div>
  </section>`;
}

function IsaAllowancePanel({ usage, currency, visible }) {
  const status = usage.percent >= 100 ? 'limit reached' : usage.percent >= 80 ? 'nearing limit' : 'within allowance';
  return html`<section class="isa-allowance-panel">
    <div class="isa-allowance-main">
      <div class="isa-allowance-heading"><div><span class="isa-badge">HMRC</span><span class="isa-title">ISA allowance tracker</span></div><${PanelInfo} text="An estimate of ISA subscriptions made through this connected account between 6 April and 5 April. It includes deposits and does not account for subscriptions or transfers with other ISA providers, flexible-ISA withdrawals, or your account wrapper." /></div>
      <div class="isa-allowance-meta">${usage.label} tax year · ${status}</div>
      <div class="isa-progress" role="progressbar" aria-label="Estimated ISA allowance used" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${usage.percent}><i style=${{ width: usage.percent + '%' }}></i></div>
    </div>
    <div class="isa-allowance-stat"><span>Used</span><strong>${formatMoney(usage.used, currency, visible)}</strong><small>${visible ? usage.percent.toFixed(1) + '% of £20,000' : '••••'}</small></div>
    <div class="isa-allowance-stat"><span>Remaining</span><strong>${formatMoney(usage.remaining, currency, visible)}</strong><small>Estimated available allowance</small></div>
    <div class="isa-allowance-note">For guidance only — confirm your total ISA subscriptions with all providers before contributing.</div>
  </section>`;
}

function IsaCashEfficiencyPanel({ cash, portfolioValue, currency, visible }) {
  const [rate, setRate] = useState(() => {
    const saved = window.localStorage.getItem(ISA_CASH_RATE_KEY);
    return saved != null && Number.isFinite(Number(saved)) && Number(saved) >= 0 ? saved : '4.0';
  });
  const numericRate = Math.max(0, Number(rate) || 0);
  const cashAllocation = portfolioValue > 0 ? cash / portfolioValue * 100 : 0;
  const annualInterest = cash * numericRate / 100;
  const estimatedCharge = annualInterest * 0.22;
  const updateRate = event => {
    const next = event.target.value;
    setRate(next);
    if (next !== '' && Number.isFinite(Number(next)) && Number(next) >= 0) {
      window.localStorage.setItem(ISA_CASH_RATE_KEY, next);
    }
  };
  return html`<section class="isa-cash-efficiency card">
    <div class="card-header"><div><div class="chart-title-row"><div class="card-title">ISA cash efficiency</div><${PanelInfo} text="Estimates the potential 22% charge on interest credited to cash held in a Stocks & Shares ISA under planned HMRC reforms from 6 April 2027. It uses your editable cash-rate assumption, not broker-reported interest, and the proposed rules may change." /></div><div class="card-subtitle">Planned 2027 rule · estimate only · not tax advice</div></div><span class="isa-cash-planned">Planned</span></div>
    <div class="isa-cash-grid">
      <div><span>Cash held</span><strong>${formatMoney(cash, currency, visible)}</strong><small>${visible ? cashAllocation.toFixed(1) + '% of portfolio' : '••••'}</small></div>
      <div><span>Assumed cash rate</span><strong><input type="number" min="0" step="0.01" inputMode="decimal" value=${rate} style=${{ width: `${Math.max(7, String(rate).length + 2)}ch` }} onInput=${updateRate} aria-label="Assumed annual cash interest rate" />%</strong><small>Editable annual assumption</small></div>
      <div><span>Estimated annual interest</span><strong>${formatMoney(annualInterest, currency, visible)}</strong><small>Before any proposed charge</small></div>
      <div class="isa-cash-charge"><span>Potential 22% charge</span><strong>${formatMoney(estimatedCharge, currency, visible)}</strong><small>On interest, not cash balance</small></div>
    </div>
  </section>`;
}

function CashInvestedGrowthPanel({ journey, currency, visible }) {
  const growthClass = journey.growth > 0 ? 'gain' : journey.growth < 0 ? 'loss' : '';
  const scale = Math.max(1, Math.abs(journey.netContributions), Math.abs(journey.growth));
  return html`<section class="chart-panel cash-growth-panel">
    <div class="chart-header"><div><div class="chart-title-row"><div class="chart-title">Cash invested vs growth</div><${PanelInfo} text="Reconciles your current portfolio value into net cash contributed and value growth. Growth includes market movements, dividends, interest, realised results and fees, and depends on complete broker transaction history." /></div><div class="chart-meta">How contributions and investment outcomes combine</div></div><div class="chart-kpi">${formatMoney(journey.netContributions + journey.growth, currency, visible)}</div></div>
    <div class="cash-growth-body">
      <div class="cash-growth-row"><div><span>Net cash contributed</span><strong>${formatMoney(journey.netContributions, currency, visible)}</strong><small>${visible ? `${formatMoney(journey.deposits, currency, true)} in · ${formatMoney(journey.withdrawals, currency, true)} out` : '••••'}</small></div><div class="cash-growth-track"><i class="contributed" style=${{ width: Math.min(100, Math.abs(journey.netContributions) / scale * 100) + '%' }}></i></div></div>
      <div class="cash-growth-row"><div><span>Investment growth</span><strong class=${growthClass}>${formatMoney(journey.growth, currency, visible)}</strong><small>Market, income and realised activity</small></div><div class="cash-growth-track"><i class=${journey.growth < 0 ? 'loss' : 'growth'} style=${{ width: Math.min(100, Math.abs(journey.growth) / scale * 100) + '%' }}></i></div></div>
    </div>
    <div class="cash-growth-total"><span>Current portfolio value</span><strong>${formatMoney(journey.netContributions + journey.growth, currency, visible)}</strong><small>Cash contributed + investment growth</small></div>
  </section>`;
}

// Renders tbody rows — always returns exactly ONE root element
function HoldingsBody({ loading, error, holdings, visible }) {
  if (loading) {
    return html`
      <${Fragment}>
        ${[0,1,2,3,4].map(i => html`
          <tr class="skeleton-row" key=${i}>
            <td><span class="skeleton skeleton-block"></span></td>
            <td><span class="skeleton skeleton-block sm"></span></td>
            <td><span class="skeleton skeleton-block sm"></span></td>
            <td><span class="skeleton skeleton-block sm"></span></td>
            <td><span class="skeleton skeleton-block sm"></span></td>
          </tr>`)}
      </${Fragment}>`;
  }
  if (error) {
    return html`
      <tr><td colspan="5">
        <div class="state-container" style=${{ padding: '32px' }}>
          <div class="state-icon">⚠</div>
          <div class="state-title">Could not load holdings</div>
          <div class="state-body">${error}</div>
        </div>
      </td></tr>`;
  }
  if (holdings.length === 0) {
    return html`
      <tr><td colspan="5">
        <div class="state-container">
          <div class="state-icon">◎</div>
          <div class="state-title">No holdings found</div>
          <div class="state-body">Your portfolio appears to be empty.</div>
        </div>
      </td></tr>`;
  }
  return html`
    <${Fragment}>
      ${holdings.map((h, i) => html`
        <${HoldingRow}
          key=${holdingIdentity(h) || i}
          holding=${h}
          visible=${visible}
        />`)}
    </${Fragment}>`;
}

function HoldingsPagination({ page, pageCount, total, pageSize, onPageChange }) {
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1)
    .filter(number => pageCount <= 5 || number === 1 || number === pageCount || Math.abs(number - page) <= 1);

  return html`
    <div class="table-pagination">
      <div class="table-pagination-summary">Showing ${first}–${last} of ${total} holdings</div>
      <nav class="table-pagination-controls" aria-label="Holdings pages">
        <button class="pagination-button" type="button" disabled=${page === 1} onClick=${() => onPageChange(page - 1)}>Previous</button>
        ${pageNumbers.map((number, index) => html`
          ${index > 0 && number - pageNumbers[index - 1] > 1 ? html`<span class="pagination-ellipsis">…</span>` : null}
          <button
            class=${'pagination-button pagination-number' + (number === page ? ' active' : '')}
            type="button"
            aria-current=${number === page ? 'page' : null}
            onClick=${() => onPageChange(number)}
          >${number}</button>`)}
        <button class="pagination-button" type="button" disabled=${page === pageCount} onClick=${() => onPageChange(page + 1)}>Next</button>
      </nav>
    </div>`;
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function DashboardView({ visible, refreshKey }) {
  const {
    data: summary, loading: sumLoading, error: sumError,
  } = useApi(endpoints.accountSummary, refreshKey);

  const {
    data: portfolio, loading: portLoading, error: portError,
  } = useApi(endpoints.portfolio, refreshKey);

  const { data: orderData } = useApi(endpoints.orders, refreshKey);
  const { data: transactionData } = useApi(endpoints.transactions, refreshKey);
  const [ordersRange, setOrdersRange] = useState('1m');
  const [holdingSort, setHoldingSort] = useState({ key: 'pnl', direction: 'desc' });
  const [holdingPage, setHoldingPage] = useState(1);
  const [analysisOpen, setAnalysisOpen] = useState(() => (
    typeof window === 'undefined' || window.matchMedia('(min-width: 621px)').matches
  ));

  // Keep the initial dashboard calm on a handset while leaving analysis ready
  // to inspect on desktop. The post-mount check also covers embedded browsers
  // that report viewport dimensions after the first render.
  useEffect(() => {
    setAnalysisOpen(window.matchMedia('(min-width: 621px)').matches);
  }, []);

  const holdings = (() => {
    if (!portfolio) return [];
    if (Array.isArray(portfolio)) return portfolio;
    return portfolio.holdings ?? portfolio.positions ?? [];
  })();

  const sortedHoldings = [...holdings].sort((left, right) => {
    const leftValue = holdingSort.key === 'quantity' ? normalizeHolding(left).qty
      : holdingSort.key === 'value' ? normalizeHolding(left).curValue : holdingPnLPercentage(left);
    const rightValue = holdingSort.key === 'quantity' ? normalizeHolding(right).qty
      : holdingSort.key === 'value' ? normalizeHolding(right).curValue : holdingPnLPercentage(right);
    return (Number(leftValue) - Number(rightValue)) * (holdingSort.direction === 'asc' ? 1 : -1);
  });
  const holdingPageCount = Math.max(1, Math.ceil(sortedHoldings.length / HOLDINGS_PAGE_SIZE));
  const activeHoldingPage = Math.min(holdingPage, holdingPageCount);
  const paginatedHoldings = sortedHoldings.slice(
    (activeHoldingPage - 1) * HOLDINGS_PAGE_SIZE,
    activeHoldingPage * HOLDINGS_PAGE_SIZE,
  );

  const handleHoldingSort = key => {
    setHoldingPage(1);
    setHoldingSort(current => ({
      key,
      direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  // Compute P&L from holdings (backend profitLoss field is unreliable / returns 0)
  const totalCostBasis   = holdings.reduce((s, h) => s + (h.costBasis    ?? 0), 0);
  const totalCurrentVal  = holdings.reduce((s, h) => s + (h.currentValue ?? 0), 0);
  const totalPortfolioValue = Number(summary?.totalValue) || (totalCurrentVal + (Number(summary?.cash) || 0));
  const computedPnL      = holdings.length > 0 ? totalCurrentVal - totalCostBasis : parseFloat(summary?.profitLoss ?? 0);
  const weightedTerOcf = totalCurrentVal > 0
    ? holdings.reduce((total, holding) => {
        return total + (fundChargeForHolding(holding) ?? 0) * ((holding.currentValue ?? 0) / totalCurrentVal);
      }, 0)
    : null;
  const hasTerOcf = holdings.length > 0;
  const pnlPct           = totalCostBasis > 0
    ? (computedPnL >= 0 ? '+' : '') + ((computedPnL / totalCostBasis) * 100).toFixed(2) + '%'
    : null;

  const currency = summary?.currency ?? 'GBP';
  const pace = contributionPace(transactionData?.items ?? transactionData);
  const isaUsage = isaAllowanceUsage(transactionData?.items ?? transactionData);
  const valueJourney = portfolioValueJourney(transactionData?.items ?? transactionData, totalPortfolioValue);
  const brokers = brokerBreakdown(holdings);
  return html`
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Portfolio Overview</h1>
        <p class="page-subtitle">Real-time summary of your investment account</p>
      </div>

      <div class="stat-grid">
        <${KpiSection}
          loading=${sumLoading || portLoading}
          error=${sumError ?? portError}
          summary=${summary}
          pnlNum=${computedPnL}
          pnlPct=${pnlPct}
          currency=${currency}
          visible=${visible}
          terOcf=${hasTerOcf ? weightedTerOcf : null}
        />
      </div>

      <${BrokerAllocationPanel} brokers=${brokers} currency=${currency} visible=${visible} />

      <${IsaAllowancePanel} usage=${isaUsage} currency=${currency} visible=${visible} />

      <div class="chart-grid">
        <${CashInvestedGrowthPanel}
          journey=${valueJourney}
          currency=${currency}
          visible=${visible}
        />
        <${SectorPieChart}
          holdings=${holdings}
          visible=${visible}
          currency=${currency}
          pace=${pace}
        />
        <${OrdersBarChart}
          orders=${orderData?.items ?? orderData}
          range=${ordersRange}
          onRangeChange=${setOrdersRange}
          visible=${visible}
          currency=${currency}
        />
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Holdings</div>
            <div class="card-subtitle">Open positions in your portfolio</div>
          </div>
        </div>

        <div class="data-table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Instrument</th>
                <${SortableHeader} label="Quantity" sortKey="quantity" activeKey=${holdingSort.key} direction=${holdingSort.direction} onSort=${handleHoldingSort} />
                <${SortableHeader} label="Market Value" sortKey="value" activeKey=${holdingSort.key} direction=${holdingSort.direction} onSort=${handleHoldingSort} />
                <th class="text-right">Ongoing charge</th>
                <${SortableHeader} label="Unrealised P&L %" sortKey="pnl" activeKey=${holdingSort.key} direction=${holdingSort.direction} onSort=${handleHoldingSort} />
              </tr>
            </thead>
            <tbody>
              <${HoldingsBody}
                loading=${portLoading}
                error=${portError}
                holdings=${paginatedHoldings}
                visible=${visible}
              />
            </tbody>
          </table>
        </div>
        ${!portLoading && !portError ? html`<${HoldingsPagination}
          page=${activeHoldingPage}
          pageCount=${holdingPageCount}
          total=${sortedHoldings.length}
          pageSize=${HOLDINGS_PAGE_SIZE}
          onPageChange=${setHoldingPage}
        />` : null}
      </div>

      <section class="secondary-analytics card">
        <button
          type="button"
          class="secondary-analytics-toggle"
          aria-expanded=${analysisOpen}
          aria-controls="portfolio-analysis-content"
          onClick=${() => setAnalysisOpen(open => !open)}
        >
          <span>
            <span class="secondary-analytics-eyebrow">Deeper analysis</span>
            <strong>Portfolio analysis</strong>
            <small>Review guardrails, cash drag and planned ISA cash rules.</small>
          </span>
          <span class="secondary-analytics-action">${analysisOpen ? 'Hide' : 'Review'} <i aria-hidden="true">${analysisOpen ? '⌃' : '⌄'}</i></span>
        </button>
        ${analysisOpen ? html`<div id="portfolio-analysis-content" class="secondary-analytics-content">
          <${PortfolioHealthPanel}
            holdings=${holdings}
            invested=${totalCurrentVal}
            portfolioValue=${totalPortfolioValue}
            cash=${Number(summary?.cash) || 0}
            terOcf=${hasTerOcf ? weightedTerOcf : null}
            summary=${summary}
            visible=${visible}
          />
          <${IsaCashEfficiencyPanel}
            cash=${Number(summary?.cash) || 0}
            portfolioValue=${totalPortfolioValue}
            currency=${currency}
            visible=${visible}
          />
        </div>` : null}
      </section>
    </div>`;
}
