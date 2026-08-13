import { html } from '../react.js';

function SettingRow({ label, desc, children }) {
  return html`
    <div class="settings-row">
      <div>
        <div class="settings-row-label">${label}</div>
        ${desc ? html`<div class="settings-row-desc">${desc}</div>` : null}
      </div>
      <div>${children}</div>
    </div>`;
}

function ToggleSwitch({ checked, onChange }) {
  return html`
    <label class="toggle-switch">
      <input type="checkbox" checked=${checked} onChange=${onChange} />
      <span class="toggle-track"></span>
    </label>`;
}

function BrokerChip() {
  return html`
    <span class="broker-chip" style=${{ display: 'inline-flex' }}>
      <span class="dot"></span>
      Trading 212
    </span>`;
}

function MonoValue({ children }) {
  return html`
    <div class="settings-row-value" style=${{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
      ${children}
    </div>`;
}

export default function SettingsView({ visible, onToggleValues }) {
  return html`
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Settings</h1>
        <p class="page-subtitle">Preferences and account configuration</p>
      </div>

      <div class="settings-group">
        <div class="settings-group-header">Display Preferences</div>
        <${SettingRow}
          label="Hide financial values"
          desc="Masks all monetary amounts across the application. Useful for screen-sharing."
        >
          <${ToggleSwitch} checked=${!visible} onChange=${onToggleValues} />
        </${SettingRow}>
      </div>

      <div class="settings-group">
        <div class="settings-group-header">Broker Connection</div>
        <${SettingRow} label="Broker" desc="Currently connected broker adapter">
          <${BrokerChip} />
        </${SettingRow}>
        <${SettingRow} label="API Base URL" desc="Configurable via TRADING212_BASE_URL environment variable">
          <${MonoValue}>live.trading212.com</${MonoValue}>
        </${SettingRow}>
        <${SettingRow} label="Broker refresh interval" desc="Broker data is cached for 15 minutes to respect upstream rate limits">
          <div class="settings-row-value">30 seconds</div>
        </${SettingRow}>
        <${SettingRow} label="Rate Limit" desc="Token bucket enforced on outbound API requests">
          <div class="settings-row-value">4 req/s</div>
        </${SettingRow}>
      </div>

      <div class="settings-group">
        <div class="settings-group-header">About</div>
        <${SettingRow} label="Application">
          <div class="settings-row-value">Mosaic</div>
        </${SettingRow}>
        <${SettingRow} label="Backend">
          <div class="settings-row-value">Go / net/http</div>
        </${SettingRow}>
        <${SettingRow} label="Frontend">
          <div class="settings-row-value">React 18 · htm · ESM (no build step)</div>
        </${SettingRow}>
      </div>

      <section class="settings-group product-scope-note" aria-label="Product scope">
        <div class="settings-group-header">Product scope</div>
        <p>Mosaic is a portfolio analytics and information tool. It is not a broker, investment platform, investment adviser or financial planner.</p>
        <p>Mosaic does not custody assets, execute trades, or provide personal investment recommendations. Information is general and educational; investing involves risk and you should seek advice from an FCA-authorised adviser where appropriate.</p>
      </section>
    </div>`;
}
