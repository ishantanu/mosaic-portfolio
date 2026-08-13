import { html, useState } from '../react.js';
import { useApi } from '../useApi.js';
import { endpoints } from '../api.js';
import { formatMoney, formatNumber, formatPnL, tickerInitials } from '../format.js';
import { displayTicker, holdingIdentity, normalizePosition } from '../normalize.js';
import { DIRECT_COMPANY_BY_TICKER, ETF_LOOK_THROUGH } from '../etfLookThrough.js';

const SECTOR_BY_TICKER = {
  VWRPL_EQ: 'Global equity ETF', WLDSL_EQ: 'Global equity ETF', SEMIL_EQ: 'Semiconductors',
  SSLNL_EQ: 'Precious metals', SGLNL_EQ: 'Precious metals', RPII_EQ: 'Technology',
  UKWL_EQ: 'Renewable energy', BARCL_EQ: 'Financials', GOOGL_US_EQ: 'Communication services',
  AZNL_EQ: 'Healthcare',
};

function positionReturn(pos) {
  const value = normalizePosition(pos);
  const cost = Number(pos.costBasis ?? pos.walletImpact?.totalCost ?? value.avgPrice * value.qty);
  return cost > 0 ? (value.pnlRaw / cost) * 100 : null;
}

function SortableHeader({ label, sortKey, active, direction, onSort }) {
  return html`<th class="text-right" aria-sort=${active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
    <button class=${'table-sort-button' + (active ? ' active' : '')} onClick=${() => onSort(sortKey)}>${label}<span>${active ? (direction === 'asc' ? '↑' : '↓') : '↕'}</span></button>
  </th>`;
}

function PositionRow({ pos, visible, portfolioValue }) {
  const { ticker, name, qty, avgPrice, curPrice, curValue, currency, instrumentCurrency, broker, pnlRaw, fxImpact, isForeignCurrency, usesTrading212FXFeeEstimate, estimatedExitFxFee } = normalizePosition(pos);
  const listedTicker = displayTicker(ticker);
  const { text: pnlText, cls: pnlCls } = formatPnL(pnlRaw, currency, visible);
  const pctRaw = positionReturn(pos);
  const weight = portfolioValue > 0 ? (curValue / portfolioValue) * 100 : null;
  return html`<tr>
    <td><div class="ticker-cell"><div class="ticker-avatar">${tickerInitials(listedTicker)}</div><div><div class="ticker-name">${name}</div><div class="ticker-sub">${listedTicker} · ${SECTOR_BY_TICKER[ticker] ?? 'Listed equity'}${broker ? ` · ${broker}` : ''}</div></div></div></td>
    <td class="text-right mono">${formatNumber(qty, 4, visible)}</td>
    <td class="text-right mono">${formatMoney(avgPrice, instrumentCurrency, visible)}</td>
    <td class="text-right mono">${formatMoney(curPrice, instrumentCurrency, visible)}</td>
    <td class="text-right mono"><div>${formatMoney(curValue, currency, visible)}</div><div class="ticker-sub">${weight == null || !visible ? (visible ? '—' : '••••') : weight.toFixed(1) + '% of portfolio'}${isForeignCurrency && visible ? ` · FX P/L ${formatPnL(fxImpact, currency, true).text}${usesTrading212FXFeeEstimate ? ` · T212 exit FX est. ${formatMoney(estimatedExitFxFee, currency, true)}` : ''}` : ''}</div></td>
    <td class="text-right"><div class=${'mono ' + pnlCls}>${pnlText}</div><div class=${'ticker-sub ' + pnlCls}>${pctRaw == null || !visible ? (visible ? '—' : '••••') : (pctRaw >= 0 ? '+' : '') + pctRaw.toFixed(2) + '%'}</div></td>
  </tr>`;
}

function Insight({ label, value, meta, cls }) {
  return html`<section class="position-insight"><div class="insight-eyebrow">${label}</div><div class=${'position-insight-value ' + (cls ?? '')}>${value}</div><div class="insight-caption">${meta}</div></section>`;
}

function ExposureBreakdown({ positions, total, currency, visible }) {
  const leaders = [...positions].sort((a, b) => normalizePosition(b).curValue - normalizePosition(a).curValue).slice(0, 5);
  return html`<section class="card exposure-card">
    <div class="card-header"><div><div class="card-title">Exposure concentration</div><div class="card-subtitle">Largest positions by current market value</div></div></div>
    <div class="exposure-list">
      ${leaders.map((position, index) => {
        const normalized = normalizePosition(position);
        const weight = total > 0 ? (normalized.curValue / total) * 100 : 0;
        return html`<div class="exposure-row" key=${normalized.ticker ?? index}>
          <div class="exposure-row-label"><div><span>${normalized.name}</span><small>${displayTicker(normalized.ticker)}</small></div><strong>${visible ? weight.toFixed(1) + '%' : '••••'}</strong></div>
          <div class="exposure-bar"><i style=${{ width: Math.min(100, weight) + '%' }}></i></div>
          <span>${formatMoney(normalized.curValue, currency, visible)}</span>
        </div>`;
      })}
    </div>
  </section>`;
}

function PortfolioReview({ positions, total, topThree, largest, visible }) {
  const largestPosition = normalizePosition(largest);
  const largestWeight = total > 0 ? (largestPosition.curValue / total) * 100 : 0;
  const concentrated = largestWeight >= 25 || (total > 0 && (topThree / total) * 100 >= 60);
  const sectors = new Set(positions.map(position => SECTOR_BY_TICKER[normalizePosition(position).ticker] ?? 'Listed equity')).size;
  const prompts = [
    concentrated
      ? { tone: 'review', title: 'Concentration deserves a review', body: `${largestPosition.name} is ${largestWeight.toFixed(1)}% of invested capital. Consider whether that single-instrument exposure matches your risk tolerance.` }
      : { tone: 'positive', title: 'No single-position concentration flag', body: 'Your largest holding is below the 25% review threshold used by this dashboard.' },
    sectors < 3
      ? { tone: 'review', title: 'Limited sector breadth', body: `Your holdings span ${sectors} broad sector${sectors === 1 ? '' : 's'} in this classification. Holdings can move together even when there are several tickers.` }
      : { tone: 'positive', title: 'Broad sector coverage', body: `The portfolio has exposure across ${sectors} broad sectors in this classification.` },
  ];
  return html`<section class="card portfolio-review-card">
    <div class="card-header"><div><div class="card-title">Portfolio review prompts</div><div class="card-subtitle">Risk flags to consider — not personal investment advice</div></div></div>
    <div class="review-list">${prompts.map((prompt, index) => html`<div class=${'review-row ' + prompt.tone} key=${index}><i>${prompt.tone === 'review' ? '!' : '✓'}</i><div><strong>${prompt.title}</strong><p>${visible ? prompt.body : '••••'}</p></div></div>`)}</div>
  </section>`;
}

function EffectiveExposure({ positions, total, visible }) {
  const [direction, setDirection] = useState('desc');
  const entries = new Map();
  const direct = new Map();
  const sources = new Map();
  positions.forEach(position => {
    const normalized = normalizePosition(position);
    const ticker = displayTicker(normalized.ticker).toUpperCase();
    const weight = total > 0 ? (normalized.curValue / total) * 100 : 0;
    const company = DIRECT_COMPANY_BY_TICKER[ticker];
    if (company) {
      direct.set(company, (direct.get(company) ?? 0) + weight);
      entries.set(company, (entries.get(company) ?? 0) + weight);
    }
    const fund = ETF_LOOK_THROUGH[ticker];
    if (fund) fund.holdings.forEach(component => {
      const indirect = weight * component.weight / 100;
      entries.set(component.company, (entries.get(component.company) ?? 0) + indirect);
      const companySources = sources.get(component.company) ?? [];
      companySources.push({ ticker, weight: indirect });
      sources.set(component.company, companySources);
    });
  });
  const exposures = [...entries.entries()]
    .map(([company, weight]) => ({ company, weight, direct: direct.get(company) ?? 0, indirect: sources.get(company) ?? [] }))
    .sort((a, b) => b.weight - a.weight);
  if (exposures.length === 0) return null;
  const snapshot = [...sources.values()].flat().map(item => ETF_LOOK_THROUGH[item.ticker]).find(Boolean);
  const maxWeight = exposures[0].weight || 1;
  const sortedExposures = [...exposures].sort((left, right) => (left.weight - right.weight) * (direction === 'asc' ? 1 : -1));
  return html`<section class="card effective-exposure-card">
    <div class="card-header"><div><div class="card-title-row"><div class="card-title">Effective company exposure</div><${EffectiveInfo} source=${snapshot?.source + ' · ' + snapshot?.asOf + ' · partial top-holdings coverage'} /></div><div class="card-subtitle">All companies covered by your current ETF constituent snapshots</div></div><div class="effective-card-actions"><button type="button" class="effective-sort-button" onClick=${() => setDirection(current => current === 'desc' ? 'asc' : 'desc')}>Effective % ${direction === 'desc' ? '↓' : '↑'}</button></div></div>
    <div class="effective-exposure-legend"><span><i class="direct"></i>Direct shares</span><span><i class="indirect"></i>Via ETFs</span><span>${exposures.length} companies currently mapped</span></div>
    <div class="effective-exposure-map">
      <div class="effective-exposure-columns"><span>Company</span><span>Combined exposure</span><span>Direct</span><span>Via ETFs</span><span>Effective</span></div>
      ${sortedExposures.map(item => {
        const indirectWeight = item.indirect.reduce((sum, source) => sum + source.weight, 0);
        const directWidth = (item.direct / maxWeight) * 100;
        const indirectWidth = (indirectWeight / maxWeight) * 100;
        return html`<div class="effective-exposure-row" key=${item.company}>
          <strong>${item.company}</strong>
          <div class="effective-exposure-bar" aria-label=${item.company + ' effective exposure'}><i class="direct" style=${{ width: directWidth + '%' }}></i><i class="indirect" style=${{ width: indirectWidth + '%' }}></i></div>
          <span>${visible ? item.direct.toFixed(2) + '%' : '••••'}</span>
          <span>${visible ? indirectWeight.toFixed(2) + '%' : '••••'}</span>
          <b>${visible ? item.weight.toFixed(2) + '%' : '••••'}</b>
        </div>`;
      })}
    </div>
  </section>`;
}

function OverlapAndIntelligence({ positions, total, visible }) {
  const direct = positions.map(position => ({ ticker: displayTicker(normalizePosition(position).ticker).toUpperCase(), name: normalizePosition(position).name }));
  const overlaps = [];
  positions.forEach(position => {
    const normalized = normalizePosition(position);
    const fundTicker = displayTicker(normalized.ticker).toUpperCase();
    const fund = ETF_LOOK_THROUGH[fundTicker];
    if (!fund) return;
    fund.holdings.forEach(component => {
      const linked = direct.find(item => DIRECT_COMPANY_BY_TICKER[item.ticker] === component.company);
      if (linked) overlaps.push({ fund: fundTicker, stock: linked.ticker, company: component.company, portfolioWeight: (normalized.curValue / total) * component.weight / 100 });
    });
  });
  const foreign = positions.filter(position => normalizePosition(position).isForeignCurrency).length;
  return html`<div class="position-detail-grid"><section class="card"><div class="card-header"><div><div class="card-title">ETF overlap</div><div class="card-subtitle">Look-through overlap with your direct shares</div></div></div><div class="overlap-list">${overlaps.length ? overlaps.map(item => html`<div class="overlap-row" key=${item.fund + item.stock}><span>${item.fund} ↔ ${item.stock}</span><strong>${visible ? item.portfolioWeight.toFixed(2) + '%' : '••••'}</strong><small>${item.company} exposure through the ETF</small></div>`) : html`<div class="insight-empty">No direct-stock overlap found in the mapped ETF constituents.</div>`}</div></section><section class="card"><div class="card-header"><div><div class="card-title">Instrument intelligence</div><div class="card-subtitle">Current portfolio implementation checks</div></div></div><div class="intelligence-list"><div><span>Foreign-currency holdings</span><strong>${visible ? foreign + ' position' + (foreign === 1 ? '' : 's') : '••••'}</strong></div><div><span>Look-through coverage</span><strong>Published ETF snapshot</strong></div><div><span>Action</span><strong>Review concentration before adding</strong></div></div></section></div>`;
}

function EffectiveInfo({ source }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const show = event => {
    const rect = event.currentTarget.getBoundingClientRect();
    setPosition({ top: rect.bottom + 8, left: Math.max(150, Math.min(rect.left + rect.width / 2, window.innerWidth - 170)) });
    setOpen(true);
  };
  return html`<span class="panel-info-wrap"><button type="button" class="panel-info" aria-label="About effective company exposure" onMouseEnter=${show} onMouseLeave=${() => setOpen(false)} onFocus=${show} onBlur=${() => setOpen(false)}>i</button>${open ? html`<span role="tooltip" class="panel-info-tooltip" style=${{ top: position.top + 'px', left: position.left + 'px' }}>Effective exposure combines direct shares in a company with its estimated weight inside ETFs you hold. It is a current, partial look-through based on dated published ETF constituents, not a live or complete fund holding record. Source: ${source}.</span>` : null}</span>`;
}

export default function PositionsView({ visible, refreshKey }) {
  const { data, loading, error } = useApi(endpoints.positions, refreshKey);
  const [sort, setSort] = useState({ key: 'pnl', direction: 'desc' });
  const positions = Array.isArray(data) ? data : (data?.items ?? []);
  const currency = positions[0]?.walletImpact?.currency ?? positions[0]?.currency ?? 'GBP';
  const total = positions.reduce((sum, pos) => sum + normalizePosition(pos).curValue, 0);
  const ranked = [...positions].sort((a, b) => {
    const value = pos => sort.key === 'value' ? normalizePosition(pos).curValue : sort.key === 'quantity' ? normalizePosition(pos).qty : (positionReturn(pos) ?? Number.NEGATIVE_INFINITY);
    return (value(a) - value(b)) * (sort.direction === 'asc' ? 1 : -1);
  });
  const largest = [...positions].sort((a, b) => normalizePosition(b).curValue - normalizePosition(a).curValue)[0];
  const largestValue = largest ? normalizePosition(largest).curValue : 0;
  const topThree = [...positions].sort((a, b) => normalizePosition(b).curValue - normalizePosition(a).curValue).slice(0, 3).reduce((sum, pos) => sum + normalizePosition(pos).curValue, 0);
  const winners = positions.filter(position => normalizePosition(position).pnlRaw > 0).length;
  const handleSort = key => setSort(current => ({ key, direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc' }));

  return html`<div class="page">
    <div class="page-header"><h1 class="page-title">Open Positions</h1><p class="page-subtitle">Position-level performance, portfolio weight and concentration risk</p></div>
    ${!loading && !error && positions.length ? html`<div class="position-insight-grid">
      <${Insight} label="Market exposure" value=${formatMoney(total, currency, visible)} meta=${positions.length + ' open positions'} />
      <${Insight} label="Largest position" value=${visible ? displayTicker(normalizePosition(largest).ticker) + ' · ' + ((largestValue / total) * 100).toFixed(1) + '%' : '••••'} meta=${visible ? normalizePosition(largest).name : 'Largest allocation by value'} />
      <${Insight} label="Top-three concentration" value=${visible ? ((topThree / total) * 100).toFixed(1) + '%' : '••••'} meta="Share of portfolio held in three largest positions" />
      <${Insight} label="Positions in profit" value=${visible ? winners + ' / ' + positions.length : '••••'} meta="Based on current unrealised P/L" cls=${winners > positions.length / 2 ? 'gain' : ''} />
    </div>` : null}

    ${!loading && !error && positions.length ? html`<${ExposureBreakdown} positions=${positions} total=${total} currency=${currency} visible=${visible} />` : null}
    ${!loading && !error && positions.length ? html`<${EffectiveExposure} positions=${positions} total=${total} visible=${visible} />` : null}
    ${!loading && !error && positions.length ? html`<${OverlapAndIntelligence} positions=${positions} total=${total} visible=${visible} />` : null}
    ${!loading && !error && positions.length ? html`<${PortfolioReview} positions=${positions} total=${total} topThree=${topThree} largest=${largest} visible=${visible} />` : null}

    <div class="card positions-table-card">
      <div class="card-header"><div><div class="card-title">Positions</div><div class="card-subtitle">${loading ? 'Loading…' : positions.length + ' open position' + (positions.length === 1 ? '' : 's') + ' · ordered by ' + (sort.key === 'pnl' ? 'unrealised P/L %' : sort.key)}</div></div></div>
      <div class="data-table-wrap"><table class="data-table"><thead><tr>
        <th>Instrument</th><${SortableHeader} label="Quantity" sortKey="quantity" active=${sort.key === 'quantity'} direction=${sort.direction} onSort=${handleSort} />
        <th class="text-right">Avg. cost</th><th class="text-right">Current price</th><${SortableHeader} label="Market value" sortKey="value" active=${sort.key === 'value'} direction=${sort.direction} onSort=${handleSort} />
        <${SortableHeader} label="Unrealised P/L %" sortKey="pnl" active=${sort.key === 'pnl'} direction=${sort.direction} onSort=${handleSort} />
      </tr></thead><tbody>
        ${loading ? [0,1,2,3,4,5].map(i => html`<tr class="skeleton-row" key=${i}>${[0,1,2,3,4,5].map(col => html`<td key=${col}><span class="skeleton skeleton-block sm"></span></td>`)}</tr>`)
          : error ? html`<tr><td colspan="6"><div class="state-container"><div class="state-icon">⚠</div><div class="state-title">Failed to load positions</div><div class="state-body">${error}</div></div></td></tr>`
          : positions.length === 0 ? html`<tr><td colspan="6"><div class="state-container"><div class="state-icon">▦</div><div class="state-title">No open positions</div><div class="state-body">You have no open positions at this time.</div></div></td></tr>`
          : ranked.map((position, index) => html`<${PositionRow} key=${holdingIdentity(position) || index} pos=${position} visible=${visible} portfolioValue=${total} />`)}
      </tbody></table></div>
    </div>
  </div>`;
}
