import { html } from '../react.js';
import { useApi } from '../useApi.js';
import { endpoints } from '../api.js';
import { formatMoney, formatNumber, formatDateTime, tickerInitials } from '../format.js';
import { displayTicker, instrumentDisplayName } from '../normalize.js';

// These are proper React components (PascalCase), called with <${Comp}/> syntax
function SideBadge({ side }) {
  if (!side) return html`<span class="badge badge-grey">—</span>`;
  const s = side.toLowerCase();
  if (s === 'buy')  return html`<span class="badge badge-buy">Buy</span>`;
  if (s === 'sell') return html`<span class="badge badge-sell">Sell</span>`;
  return html`<span class="badge badge-grey">${side}</span>`;
}

function StatusBadge({ status }) {
  if (!status) return null;
  const s = status.toLowerCase();
  const cls =
    s === 'filled'    ? 'badge-green' :
    s === 'cancelled' ? 'badge-grey'  :
    s === 'rejected'  ? 'badge-red'   :
    s === 'pending'   ? 'badge-gold'  : 'badge-blue';
  return html`<span class=${'badge ' + cls}>${status}</span>`;
}

function OrderRow({ item, visible }) {
  const order    = item.order ?? item;
  const fill     = item.fill  ?? {};
  const ticker   = order.ticker ?? order.instrument?.ticker ?? '—';
  const listedTicker = displayTicker(ticker);
  const name     = instrumentDisplayName(order, ticker);
  const side     = order.side;
  const type     = order.type ?? order.orderType;
  const qty      = order.quantity ?? fill.quantity;
  const status   = order.status;
  const created  = order.createdAt ?? order.dateCreated;
  const price    = fill.price ?? order.limitPrice ?? order.price;
  const currency = order.currency ?? fill.currency ?? 'GBP';

  return html`
    <tr>
      <td>
        <div class="ticker-cell">
          <div class="ticker-avatar">${tickerInitials(listedTicker)}</div>
          <div>
            <div class="ticker-name">${name}</div>
            <div class="ticker-sub">${listedTicker} · ${type ?? '—'}</div>
          </div>
        </div>
      </td>
      <td><${SideBadge} side=${side} /></td>
      <td class="text-right mono">${formatNumber(qty, 4, visible)}</td>
      <td class="text-right mono">${price != null ? formatMoney(price, currency, visible) : '—'}</td>
      <td><${StatusBadge} status=${status} /></td>
      <td class="text-right" style=${{ color: 'var(--text-muted)', fontSize: '12px' }}>
        ${formatDateTime(created)}
      </td>
    </tr>`;
}

export default function OrdersView({ visible, refreshKey }) {
  const { data, loading, error } = useApi(endpoints.orders, refreshKey);
  const orders     = Array.isArray(data) ? data : (data?.items ?? []);
  const countLabel = loading
    ? 'Loading…'
    : orders.length + ' order' + (orders.length !== 1 ? 's' : '');

  return html`
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Order History</h1>
        <p class="page-subtitle">Your most recent 20 orders</p>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Orders</div>
            <div class="card-subtitle">${countLabel}</div>
          </div>
        </div>

        <div class="data-table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Instrument</th>
                <th>Side</th>
                <th class="text-right">Quantity</th>
                <th class="text-right">Fill Price</th>
                <th>Status</th>
                <th class="text-right">Date</th>
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
                      <td><span class="skeleton skeleton-block sm"></span></td>
                      <td><span class="skeleton skeleton-block sm"></span></td>
                    </tr>`)
                : error
                  ? html`<tr><td colspan="6">
                      <div class="state-container">
                        <div class="state-icon">⚠</div>
                        <div class="state-title">Failed to load orders</div>
                        <div class="state-body">${error}</div>
                      </div>
                    </td></tr>`
                  : orders.length === 0
                    ? html`<tr><td colspan="6">
                        <div class="state-container">
                          <div class="state-icon">≡</div>
                          <div class="state-title">No orders found</div>
                          <div class="state-body">No order history available.</div>
                        </div>
                      </td></tr>`
                    : orders.map((item, i) => html`
                        <${OrderRow}
                          key=${item.order?.id ?? i}
                          item=${item}
                          visible=${visible}
                        />`)
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}
