import { html } from '../react.js';
import { LayoutDashboard, Wallet, ChartNoAxesCombined, ListOrdered, Coins, Settings, ArrowLeftRight } from 'lucide-react';

const NAV_ITEMS = [
  { hash: '#dashboard', label: 'Overview', icon: LayoutDashboard },
  { hash: '#summary', label: 'Account summary', icon: Wallet },
  { hash: '#positions', label: 'Positions', icon: ChartNoAxesCombined },
  { hash: '#orders', label: 'Orders', icon: ListOrdered },
  { hash: '#dividends', label: 'Dividends', icon: Coins },
  { hash: '#data', label: 'Import & export', icon: ArrowLeftRight },
  { hash: '#settings', label: 'Settings', icon: Settings },
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
                <a href=${item.hash} class=${cls} onClick=${onClose} aria-current=${currentHash === item.hash ? 'page' : undefined}>
                  <${item.icon} size=${17} strokeWidth=${1.7} aria-hidden="true" />
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
