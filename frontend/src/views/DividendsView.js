import { html } from '../react.js';
import { useApi } from '../useApi.js';
import { endpoints } from '../api.js';
import { formatMoney, formatDate, tickerInitials } from '../format.js';
import { displayTicker, instrumentDisplayName } from '../normalize.js';

function DividendRow({ div, visible }) {
  const ticker   = div.ticker ?? div.instrument?.ticker ?? '—';
  const listedTicker = displayTicker(ticker);
  const name     = instrumentDisplayName(div, ticker);
  const amount   = div.amount ?? div.grossAmount;
  const currency = div.currency ?? 'GBP';
  const paidOn   = div.paidOn ?? div.paymentDate;
  const dateStyle = { color: 'var(--text-muted)', fontSize: '12px' };

  return html`
    <tr>
      <td>
        <div class="ticker-cell">
          <div class="ticker-avatar">${tickerInitials(listedTicker)}</div>
          <div>
            <div class="ticker-name">${name}</div>
            <div class="ticker-sub">${listedTicker} · ${currency}</div>
          </div>
        </div>
      </td>
      <td class="text-right mono">${formatMoney(amount, currency, visible)}</td>
      <td class="text-right" style=${dateStyle}>${formatDate(paidOn)}</td>
      <td class="text-center"><span class="badge badge-green">Paid</span></td>
    </tr>`;
}

export default function DividendsView({ visible, refreshKey }) {
  const { data, loading, error } = useApi(endpoints.dividends, refreshKey);
  const dividends  = Array.isArray(data) ? data : (data?.items ?? []);
  const total      = dividends.reduce(
    (sum, d) => sum + parseFloat(d.amount ?? d.grossAmount ?? 0), 0,
  );
  const countLabel = loading
    ? 'Loading…'
    : 'Most recent ' + dividends.length + ' payment' + (dividends.length !== 1 ? 's' : '');

  return html`
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Dividends</h1>
        <p class="page-subtitle">Dividend payments received on your account</p>
      </div>

      ${!loading && !error && dividends.length > 0 ? html`
        <div class="summary-row" style=${{ marginBottom: '24px' }}>
          <div class="summary-cell">
            <div class="summary-cell-label">Total Received</div>
            <div class="summary-cell-value gain">
              ${visible ? ('+' + formatMoney(total, 'GBP', true)) : '••••••'}
            </div>
          </div>
          <div class="summary-cell">
            <div class="summary-cell-label">Payments</div>
            <div class="summary-cell-value">${String(dividends.length)}</div>
          </div>
        </div>` : null}

      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Payment History</div>
            <div class="card-subtitle">${countLabel}</div>
          </div>
        </div>

        <div class="data-table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Instrument</th>
                <th class="text-right">Amount</th>
                <th class="text-right">Payment Date</th>
                <th class="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              ${loading
                ? [0,1,2,3,4,5,6,7].map(i => html`
                    <tr class="skeleton-row" key=${i}>
                      <td><span class="skeleton skeleton-block"></span></td>
                      <td><span class="skeleton skeleton-block sm"></span></td>
                      <td><span class="skeleton skeleton-block sm"></span></td>
                      <td><span class="skeleton skeleton-block sm"></span></td>
                    </tr>`)
                : error
                  ? html`<tr><td colspan="4">
                      <div class="state-container">
                        <div class="state-icon">⚠</div>
                        <div class="state-title">Failed to load dividends</div>
                        <div class="state-body">${error}</div>
                      </div>
                    </td></tr>`
                  : dividends.length === 0
                    ? html`<tr><td colspan="4">
                        <div class="state-container">
                          <div class="state-icon">◎</div>
                          <div class="state-title">No dividends found</div>
                          <div class="state-body">No dividend payments have been recorded yet.</div>
                        </div>
                      </td></tr>`
                    : dividends.map((d, i) => html`
                        <${DividendRow}
                          key=${d.ticker ?? i}
                          div=${d}
                          visible=${visible}
                        />`)
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}
