import { html } from '../react.js';
import { AddBrokerButton } from './AddBrokerModal.js';

// Inject spin keyframes once
if (typeof document !== 'undefined' && !document.getElementById('_spin_kf')) {
  const s = document.createElement('style');
  s.id = '_spin_kf';
  s.textContent = '@keyframes _spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(s);
}

function EyeOpenIcon() {
  return html`
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>`;
}

function EyeClosedIcon() {
  return html`
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path>
      <line x1="1" y1="1" x2="23" y2="23"></line>
    </svg>`;
}

function RefreshIcon({ spinning }) {
  const spinStyle = { animation: spinning ? '_spin 0.8s linear infinite' : 'none' };
  return html`
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
         style=${spinStyle}>
      <polyline points="23 4 23 10 17 10"></polyline>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
    </svg>`;
}

function MenuIcon() {
  return html`
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M4 7h16"></path><path d="M4 12h16"></path><path d="M4 17h16"></path>
    </svg>`;
}

function ThemeIcon({ dark }) { return html`<span aria-hidden="true">${dark ? '☀' : '◐'}</span>`; }

export default function TopBar({
  currentPage,
  valuesVisible,
  onToggleValues,
  onRefresh,
  refreshing,
  lastUpdated,
  onMenuToggle,
  darkTheme,
  onToggleTheme,
  onAddBroker,
}) {
  const timeStr = lastUpdated
    ? new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }).format(lastUpdated)
    : null;

  const toggleCls    = 'visibility-toggle' + (valuesVisible ? '' : ' hidden');
  const toggleLabel  = valuesVisible ? 'Hide values' : 'Show values';
  const toggleTitle  = toggleLabel;

  return html`
    <header class="topbar">
      <div class="topbar-left">
        <button class="mobile-menu-button" type="button" onClick=${onMenuToggle} aria-label="Open navigation menu">
          <${MenuIcon} />
        </button>
        <span class="topbar-breadcrumb">
          Portfolio
          <span style=${{ color: '#c4cad4', margin: '0 6px' }}>›</span>
          <span>${currentPage || 'Overview'}</span>
        </span>
      </div>

      <div class="topbar-right">
        ${timeStr ? html`<span class="last-updated">Updated ${timeStr}</span>` : null}
        <button class="btn btn-ghost btn-icon" type="button" onClick=${onToggleTheme} title=${darkTheme ? 'Use light theme' : 'Use dark theme'}><${ThemeIcon} dark=${darkTheme} /></button>
        <span class="topbar-add-broker"><${AddBrokerButton} onClick=${onAddBroker} /></span>

        <button class=${toggleCls} onClick=${onToggleValues} title=${toggleTitle}>
          ${valuesVisible ? html`<${EyeOpenIcon} />` : html`<${EyeClosedIcon} />`}
          ${' ' + toggleLabel}
        </button>

        <button
          class="btn btn-ghost btn-icon"
          type="button"
          onClick=${onRefresh}
          disabled=${refreshing}
          title="Refresh data"
        >
          <${RefreshIcon} spinning=${refreshing} />
        </button>
      </div>
    </header>`;
}
