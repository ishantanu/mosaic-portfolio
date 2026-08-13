import { Fragment, html } from '../react.js';
import { useApi } from '../useApi.js';
import { endpoints } from '../api.js';
import { formatMoney, formatPnL } from '../format.js';
import { normalizeHolding } from '../normalize.js';
import { annualFundCost } from '../portfolioCosts.js';

function SummaryCell({ label, value, valueCls, meta }) {
  const cls = 'summary-cell-value' + (valueCls ? ' ' + valueCls : '');
  return html`<div class="summary-cell">
    <div class="summary-cell-label">${label}</div>
    <div class=${cls}>${value}</div>
    ${meta ? html`<div class="summary-cell-meta">${meta}</div>` : null}
  </div>`;
}

function DetailRow({ label, value, valueCls, description }) {
  const cls = 'settings-row-value mono' + (valueCls ? ' ' + valueCls : '');
  return html`<div class="settings-row">
    <div><div class="settings-row-label">${label}</div>${description ? html`<div class="settings-row-desc">${description}</div>` : null}</div>
    <div class=${cls}>${value}</div>
  </div>`;
}

function pct(value, visible) {
  if (!visible) return '••••';
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(1)}%`;
}

function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Recent' : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date);
}

function AllocationBar({ invested, cash, total, visible }) {
  const investedPct = total > 0 ? Math.max(0, Math.min(100, (invested / total) * 100)) : 0;
  const cashPct = total > 0 ? Math.max(0, Math.min(100, (cash / total) * 100)) : 0;
  return html`<section class="insight-card account-allocation-card">
    <div class="insight-eyebrow">Capital allocation</div>
    <div class="insight-title">How your account is deployed</div>
    <div class="allocation-track" aria-label="Account capital allocation">
      <span class="allocation-invested" style=${{ width: investedPct + '%' }}></span>
      <span class="allocation-cash" style=${{ width: cashPct + '%' }}></span>
    </div>
    <div class="allocation-key">
      <div><i class="allocation-dot invested"></i><span>Invested</span><strong>${pct(investedPct, visible)}</strong></div>
      <div><i class="allocation-dot cash"></i><span>Available cash</span><strong>${pct(cashPct, visible)}</strong></div>
    </div>
  </section>`;
}

function RecentActivity({ transactions, currency, visible }) {
  const activities = (Array.isArray(transactions) ? transactions : [])
    .filter(item => ['DEPOSIT', 'WITHDRAWAL'].includes(String(item.type).toUpperCase()))
    .sort((a, b) => new Date(b.dateTime ?? b.date) - new Date(a.dateTime ?? a.date))
    .slice(0, 4);
  return html`<section class="insight-card">
    <div class="insight-eyebrow">Cash activity</div>
    <div class="insight-title">Latest funding movements</div>
    ${activities.length ? html`<div class="activity-list">
      ${activities.map((item, index) => {
        const type = String(item.type).toUpperCase();
        const isDeposit = type === 'DEPOSIT';
        return html`<div class="activity-row" key=${item.reference ?? index}>
          <span class=${'activity-icon ' + (isDeposit ? 'deposit' : 'withdrawal')}>${isDeposit ? '↓' : '↑'}</span>
          <div><strong>${isDeposit ? 'Deposit' : 'Withdrawal'}</strong><span>${dateLabel(item.dateTime ?? item.date)}</span></div>
          <b class=${isDeposit ? 'gain' : ''}>${isDeposit ? '+' : '−'}${formatMoney(Math.abs(Number(item.amount) || 0), item.currency ?? currency, visible)}</b>
        </div>`;
      })}
    </div>` : html`<div class="insight-empty">Funding activity will appear here once available.</div>`}
  </section>`;
}

function CostOutlook({ holdings, invested, cash, currency, visible }) {
  const fundCost = annualFundCost(holdings);
  const fxEstimate = holdings.reduce((sum, holding) => {
    const item = normalizeHolding(holding);
    return sum + (item.usesTrading212FXFeeEstimate ? item.estimatedExitFxFee : 0);
  }, 0);
  const cashDrag = cash * 0.04;
  const total = fundCost + fxEstimate + cashDrag;
  const rows = [['Platform / custody', 0, 'Broker-specific custody pricing is not yet connected'], ['Fund TER / OCF', fundCost, 'Annual weighted fund cost'], ['Estimated spread', 0, 'No additional broker spread on shares/ETFs'], ['Trading 212 estimated FX conversion', fxEstimate, 'One-way 0.15% estimate for eligible Trading 212 foreign-currency holdings; not a fee already charged and never applied to IBKR'], ['Dealing costs', 0, 'Commission-free; taxes may still apply'], ['Cash drag', cashDrag, '4.0% assumed annual opportunity cost on cash']];
  return html`<section class="settings-group cost-outlook"><div class="settings-group-header">Estimated cost of ownership <span>Current-value estimate, not a statement of fees paid</span></div>${rows.map(([label, value, note]) => html`<div class="cost-row" key=${label}><div><strong>${label}</strong><small>${note}</small></div><b>${formatMoney(value, currency, visible)}</b></div>`)}<div class="cost-total"><span>Estimated total cost</span><strong>${formatMoney(total, currency, visible)}</strong><small>${visible && invested > 0 ? (total / invested * 100).toFixed(2) + '% of invested value' : '••••'}</small></div></section>`;
}

export default function AccountSummaryView({ visible, refreshKey }) {
  const { data, loading, error } = useApi(endpoints.accountSummary, refreshKey);
  const { data: portfolio } = useApi(endpoints.portfolio, refreshKey);
  const { data: transactionData } = useApi(endpoints.transactions, refreshKey);
  const { data: dividendData } = useApi(endpoints.dividends, refreshKey);
  const currency = data?.currency ?? 'GBP';
  const holdings = Array.isArray(portfolio) ? portfolio : (portfolio?.holdings ?? portfolio?.positions ?? []);
  const normalized = holdings.map(normalizeHolding);
  const invested = normalized.reduce((total, holding) => total + Number(holding.curValue || 0), 0) || Number(data?.balance || 0);
  const costBasis = normalized.reduce((total, holding, index) => total + Number(holdings[index]?.costBasis ?? holdings[index]?.walletImpact?.totalCost ?? 0), 0);
  const accountPnl = costBasis > 0 ? invested - costBasis : Number(data?.profitLoss || 0);
  const totalValue = Number(data?.totalValue) || invested + Number(data?.cash || 0);
  const cash = Number(data?.cash || 0);
  const returnPct = costBasis > 0 ? (accountPnl / costBasis) * 100 : null;
  const thisYear = new Date().getFullYear();
  const transactions = transactionData?.items ?? transactionData ?? [];
  const netFundingYtd = (Array.isArray(transactions) ? transactions : []).reduce((total, item) => {
    const date = new Date(item.dateTime ?? item.date);
    if (date.getFullYear() !== thisYear) return total;
    const amount = Math.abs(Number(item.amount) || 0);
    return String(item.type).toUpperCase() === 'DEPOSIT' ? total + amount : String(item.type).toUpperCase() === 'WITHDRAWAL' ? total - amount : total;
  }, 0);
  const dividendsYtd = (dividendData?.items ?? dividendData ?? []).reduce((total, item) => {
    const date = new Date(item.paidOn ?? item.date);
    return date.getFullYear() === thisYear ? total + Math.abs(Number(item.amount) || 0) : total;
  }, 0);
  const { text: pnlText, cls: pnlCls } = formatPnL(accountPnl, currency, visible);

  return html`<div class="page">
    <div class="page-header">
      <h1 class="page-title">Account Summary</h1>
      <p class="page-subtitle">Capital, performance and recent activity across your investment account</p>
    </div>

    ${loading ? html`<div class="summary-row">${[1,2,3,4].map(i => html`<div class="summary-cell" key=${i}><div class="summary-cell-label"><span class="skeleton skeleton-block sm"></span></div><div class="summary-cell-value"><span class="skeleton skeleton-block"></span></div></div>`)}</div>` : null}
    ${error ? html`<div class="card"><div class="state-container"><div class="state-icon">⚠</div><div class="state-title">Failed to load account summary</div><div class="state-body">${error}</div></div></div>` : null}

    ${!loading && !error && data ? html`<${Fragment}>
      <div class="summary-row">
        <${SummaryCell} label="Total portfolio value" value=${formatMoney(totalValue, currency, visible)} meta="Investments and available cash" />
        <${SummaryCell} label="Invested capital" value=${formatMoney(invested, currency, visible)} meta=${pct(totalValue > 0 ? (invested / totalValue) * 100 : 0, visible) + ' of account value'} />
        <${SummaryCell} label="Available cash" value=${formatMoney(cash, currency, visible)} meta=${pct(totalValue > 0 ? (cash / totalValue) * 100 : 0, visible) + ' ready to invest'} />
        <${SummaryCell} label="Unrealised result" value=${pnlText} valueCls=${pnlCls} meta=${returnPct == null ? 'Across open positions' : (visible ? (returnPct >= 0 ? '+' : '') + returnPct.toFixed(2) + '% on cost basis' : '•••• on cost basis')} />
      </div>

      <div class="insight-grid account-insight-grid">
        <${AllocationBar} invested=${invested} cash=${cash} total=${totalValue} visible=${visible} />
        <section class="insight-card">
          <div class="insight-eyebrow">This year</div>
          <div class="insight-title">Account cash flows</div>
          <div class="insight-metric">${formatMoney(netFundingYtd, currency, visible)}</div>
          <div class="insight-caption">Net deposits year to date</div>
          <div class="insight-secondary"><span>Dividends received</span><strong>${formatMoney(dividendsYtd, currency, visible)}</strong></div>
        </section>
        <${RecentActivity} transactions=${transactions} currency=${currency} visible=${visible} />
      </div>

      <div class="settings-group">
        <div class="settings-group-header">Account details</div>
        <${DetailRow} label="Open positions" value=${String(holdings.length)} description="Instruments currently held in the account" />
        <${DetailRow} label="Cost basis" value=${costBasis > 0 ? formatMoney(costBasis, currency, visible) : '—'} description="Amount paid for open positions, excluding closed positions" />
        <${DetailRow} label="Current market value" value=${formatMoney(invested, currency, visible)} description="Live value of open positions" />
        <${DetailRow} label="Unrealised profit / loss" value=${pnlText} valueCls=${pnlCls} description="Open-position gain or loss before realised activity" />
        <${DetailRow} label="Account currency" value=${currency} description="Base currency used for account reporting" />
      </div>
      <${CostOutlook} holdings=${holdings} invested=${invested} cash=${cash} currency=${currency} visible=${visible} />
    </${Fragment}>` : null}
  </div>`;
}
