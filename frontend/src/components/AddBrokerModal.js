import { useState } from '../react.js';
import { html } from '../react.js';

const PRESETS = [
  { id: 'trading212', name: 'Trading 212', icon: '📈', endpoint: 'https://live.trading212.com/api/v0' },
  { id: 'interactive-brokers', name: 'Interactive Brokers', icon: 'IB', endpoint: 'https://localhost:5000/v1/api' },
  { id: 'saxo',       name: 'Saxo',        icon: 'S', endpoint: 'https://gateway.saxobank.com/openapi' },
  { id: 'ig',         name: 'IG',          icon: 'IG', endpoint: 'https://api.ig.com/gateway/deal' },
  { id: 'custom',     name: 'Custom',      icon: '⚙️',  endpoint: '' },
];

function PlusIcon() {
  return html`
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5"  y1="12" x2="19" y2="12"></line>
    </svg>`;
}

function CloseIcon() {
  return html`
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6"  y1="6" x2="18" y2="18"></line>
    </svg>`;
}

export function AddBrokerButton({ onClick }) {
  return html`
    <button class="btn btn-add-broker" onClick=${onClick}>
      <${PlusIcon} /> Add Broker
    </button>`;
}

export function AddBrokerModal({ onClose }) {
  const [selected, setSelected]   = useState('trading212');
  const [apiKey, setApiKey]       = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [endpoint, setEndpoint]   = useState(PRESETS[0].endpoint);
  const [name, setName]           = useState('');
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);

  function selectPreset(preset) {
    setSelected(preset.id);
    setEndpoint(preset.endpoint);
    if (preset.id !== 'custom') setName(preset.name);
  }

  function handleSave(e) {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setSaving(true);
    // Connection credentials are only kept in the current browser session.
    const brokers = JSON.parse(sessionStorage.getItem('brokers') || '[]');
    brokers.push({
      id: Date.now(),
      preset: selected,
      name: name || PRESETS.find(p => p.id === selected)?.name || 'Custom',
      endpoint,
      apiKey: apiKey.trim(),
      apiSecret: apiSecret.trim(),
      addedAt: new Date().toISOString(),
    });
    sessionStorage.setItem('brokers', JSON.stringify(brokers));
    setTimeout(() => { setSaving(false); setSaved(true); }, 600);
    setTimeout(() => onClose(), 1400);
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  const preset = PRESETS.find(p => p.id === selected);

  return html`
    <div class="modal-backdrop" onClick=${handleBackdropClick}>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-header">
          <div class="modal-title" id="modal-title">Connect a Broker</div>
          <button class="modal-close" onClick=${onClose} aria-label="Close">
            <${CloseIcon} />
          </button>
        </div>

        <form onSubmit=${handleSave}>
          <div class="modal-body">

            <div class="form-label">Select Provider</div>
            <div class="broker-preset-grid">
              ${PRESETS.map(p => {
                const cls = 'broker-preset' + (selected === p.id ? ' selected' : '');
                return html`
                  <div class=${cls} key=${p.id} onClick=${() => selectPreset(p)}>
                    <div class="broker-preset-icon">${p.icon}</div>
                    <div class="broker-preset-name">${p.name}</div>
                  </div>`;
              })}
            </div>

            <div class="form-divider">Connection Details</div>

            ${selected === 'custom' ? html`
              <div class="form-group">
                <label class="form-label">Broker Name</label>
                <input
                  class="form-input"
                  type="text"
                  placeholder="My ISA Provider"
                  value=${name}
                  onInput=${e => setName(e.target.value)}
                />
              </div>` : null}

            <div class="form-group">
              <label class="form-label">API Endpoint</label>
              <input
                class="form-input"
                type="url"
                placeholder="https://api.provider.com/v1"
                value=${endpoint}
                onInput=${e => setEndpoint(e.target.value)}
                required
              />
              <div class="form-hint">Base URL for the broker API</div>
            </div>

            <div class="form-group">
              <label class="form-label">API Key</label>
              <input
                class="form-input"
                type="password"
                placeholder="Enter your API key"
                value=${apiKey}
                onInput=${e => setApiKey(e.target.value)}
                autocomplete="new-password"
                required
              />
              <div class="form-hint">Kept only for this browser session. A backend connector is required before data can be imported.</div>
            </div>

            <div class="form-group">
              <label class="form-label">API Secret ${html`<span style=${{fontWeight:400,textTransform:'none',letterSpacing:0}}>(optional)</span>`}</label>
              <input
                class="form-input"
                type="password"
                placeholder="Enter your API secret if required"
                value=${apiSecret}
                onInput=${e => setApiSecret(e.target.value)}
                autocomplete="new-password"
              />
            </div>

          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" onClick=${onClose}>Cancel</button>
            <button type="submit" class="btn btn-primary" disabled=${saving || saved}>
              ${saved ? '✓ Connected' : saving ? 'Connecting…' : 'Connect Broker'}
            </button>
          </div>
        </form>
      </div>
    </div>`;
}
