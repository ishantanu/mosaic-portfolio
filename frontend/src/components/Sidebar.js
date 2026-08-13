import { html } from '../react.js';

const NAV_ITEMS = [
  { hash: '#dashboard', label: 'Dashboard',      icon: '⊞' },
  { hash: '#summary',   label: 'Acct. Summary',  icon: '◈' },
  { hash: '#positions', label: 'Positions',       icon: '▦' },
  { hash: '#orders',    label: 'Orders',          icon: '≡' },
  { hash: '#dividends', label: 'Dividends',       icon: '◎' },
  { hash: '#settings',  label: 'Settings',        icon: '⚙' },
];

export default function Sidebar({ currentHash, open, onClose, summary }) {
  const brokers = Array.isArray(summary?.connectedBrokers) && summary.connectedBrokers.length
    ? summary.connectedBrokers
    : (summary?.broker ? [summary.broker] : ['Trading 212']);
  const demoMode = summary?.broker === 'Mosaic Demo';
  const brokerLabel = brokers.join(' + ');
  return html`
    <nav class=${'sidebar' + (open ? ' open' : '')} aria-label="Main navigation">
      <div class="sidebar-logo">
        <div class="sidebar-logo-mark" aria-hidden="true">
          <svg class="sidebar-logo-glyph" viewBox="0 0 24 24" fill="none">
            <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" fill="currentColor" opacity=".88" />
            <path d="M10 7h4M7 10v4M17 10v4M10 17h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".5" />
          </svg>
        </div>
        <div class="sidebar-logo-text">
          <strong>Mosaic</strong>
          <span>Stocks & Shares ISA aggregator</span>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-label">Navigation</div>
        <ul class="sidebar-nav">
          ${NAV_ITEMS.map(item => {
            const cls = currentHash === item.hash ? 'active' : '';
            return html`
              <li class="nav-item" key=${item.hash}>
                <a href=${item.hash} class=${cls} onClick=${onClose}>
                  <span class="nav-icon">${item.icon}</span>
                  ${item.label}
                </a>
              </li>`;
          })}
        </ul>
      </div>

      <div class="sidebar-footer">
        <div class="broker-chip">
          <span class="dot"></span>
          ${demoMode ? `Demo · ${brokerLabel}` : brokerLabel}
        </div>
        <div class="sidebar-footer-text" style=${{ marginTop: '10px' }}>
          ${demoMode ? 'Fictional data · no broker calls.' : 'Broker data refreshes every 15 minutes.'}
        </div>
      </div>
    </nav>`;
}
