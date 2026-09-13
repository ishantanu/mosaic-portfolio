import { Button, Input } from './ui/compat.js';
import { useState } from '../react.js';
import { html } from '../react.js';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog.jsx';

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
    <${Button} id="add-broker-trigger" class="btn btn-add-broker" onClick=${onClick}>
      <${PlusIcon} /> Add Broker
    </${Button}>`;
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

  return html`
    <${Dialog} open=${true} onOpenChange=${open => { if (!open) onClose(); }}>
      <${DialogContent} className="broker-dialog" showCloseButton=${false} onCloseAutoFocus=${event => { event.preventDefault(); document.getElementById('add-broker-trigger')?.focus(); }}>
        <div class="modal-header">
          <${DialogTitle}>Add a broker</${DialogTitle}>
          <${Button} class="modal-close" onClick=${onClose} aria-label="Close">
            <${CloseIcon} />
          </${Button}>
        </div>
        <${DialogDescription}>Save connection details for this session. Importing data requires a configured backend connector.</${DialogDescription}>

        <form onSubmit=${handleSave}>
          <div class="modal-body">

            <div class="form-label">Select Provider</div>
            <div class="broker-preset-grid">
              ${PRESETS.map(p => {
                const cls = 'broker-preset' + (selected === p.id ? ' selected' : '');
                return html`
                  <${Button} class=${cls} key=${p.id} aria-pressed=${selected === p.id} onClick=${() => selectPreset(p)}>
                    <div class="broker-preset-icon">${p.icon}</div>
                    <div class="broker-preset-name">${p.name}</div>
                  </${Button}>`;
              })}
            </div>

            <div class="form-divider">Connection Details</div>

            ${selected === 'custom' ? html`
              <div class="form-group">
                <label class="form-label" htmlFor="broker-name">Broker Name</label>
                <${Input}
                  id="broker-name"
                  class="form-input"
                  type="text"
                  placeholder="My ISA Provider"
                  value=${name}
                  onInput=${e => setName(e.target.value)}
                />
              </div>` : null}

            <div class="form-group">
              <label class="form-label" htmlFor="broker-endpoint">API Endpoint</label>
              <${Input}
                id="broker-endpoint"
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
              <label class="form-label" htmlFor="broker-api-key">API Key</label>
              <${Input}
                id="broker-api-key"
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
              <label class="form-label" htmlFor="broker-api-secret">API Secret ${html`<span style=${{fontWeight:400,textTransform:'none',letterSpacing:0}}>(optional)</span>`}</label>
              <${Input}
                id="broker-api-secret"
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
            <${Button} type="button" class="btn btn-ghost" onClick=${onClose}>Cancel</${Button}>
            <${Button} type="submit" class="btn btn-primary" disabled=${saving || saved}>
              ${saved ? '✓ Saved for session' : saving ? 'Saving…' : 'Save connection details'}
            </${Button}>
          </div>
        </form>
      </${DialogContent}>
    </${Dialog}>`;
}
