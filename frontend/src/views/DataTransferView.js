import { html, useState } from '../react.js';
import { Download, Upload, FileSpreadsheet } from 'lucide-react';
import { Button, Card, Input, Table } from '../components/ui/compat.js';
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table.jsx';
import { endpoints } from '../api.js';
import { useApi } from '../useApi.js';

async function checkedFetch(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error((await response.text()).trim() || 'Request failed. Please retry.');
  return response;
}

function SnapshotTable({ snapshot, visible }) {
  const [page, setPage] = useState(0);
  const rows = snapshot.holdings;
  const number = value => visible ? Number(value).toLocaleString(undefined, { maximumFractionDigits: 8 }) : '••••';
  return html`<div class="space-y-4">
    <p class="text-sm text-muted-foreground">${rows.length} holdings · Snapshot ${new Date(snapshot.snapshotAt).toLocaleString()} · Values retain their original currencies.</p>
    <${Table}>
      <${TableHeader}><${TableRow}>${['Holding', 'Broker / account', 'Quantity', 'Cost basis', 'Snapshot value'].map(label => html`<${TableHead} key=${label}>${label}</${TableHead}>`)}</${TableRow}></${TableHeader}>
      <${TableBody}>${rows.slice(page * 50, (page + 1) * 50).map(h => html`<${TableRow} key=${JSON.stringify([h.broker, h.accountId, h.ticker])}>
        <${TableCell}><strong>${h.ticker}</strong><div class="text-muted-foreground">${h.name}</div></${TableCell}>
        <${TableCell}>${h.broker}<div class="text-muted-foreground">${visible ? h.accountId : '••••'}</div></${TableCell}>
        <${TableCell}>${number(h.quantity)}</${TableCell}>
        <${TableCell}>${number(h.costBasis)} ${h.currency}</${TableCell}>
        <${TableCell}>${number(h.currentValue)} ${h.currency}</${TableCell}>
      </${TableRow}>`)}</${TableBody}>
    </${Table}>
    ${rows.length > 50 ? html`<div class="flex items-center gap-3"><${Button} disabled=${page === 0} onClick=${() => setPage(p => p - 1)}>Previous</${Button}><span>Page ${page + 1} of ${Math.ceil(rows.length / 50)}</span><${Button} disabled=${(page + 1) * 50 >= rows.length} onClick=${() => setPage(p => p + 1)}>Next</${Button}></div>` : null}
  </div>`;
}

export default function DataTransferView({ visible, refreshKey }) {
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [candidate, setCandidate] = useState(null);
  const [selected, setSelected] = useState(null);
  const imports = useApi(endpoints.portfolioImports, refreshKey + revision);
  const saved = useApi(selected ? `${endpoints.portfolioImports}?id=${encodeURIComponent(selected)}` : null);

  async function action(fn) {
    setBusy(true); setError(''); setMessage('');
    try { await fn(); } catch (err) { setError(err.message || 'Could not complete this operation. Please retry.'); }
    finally { setBusy(false); }
  }

  function download(id) {
    return action(async () => {
      const response = await checkedFetch(endpoints.portfolioExport + (id ? `?id=${encodeURIComponent(id)}` : ''));
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = id ? 'mosaic-imported-holdings.csv' : 'mosaic-holdings.csv';
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('CSV downloaded. It contains unmasked holdings and account identifiers—store it securely.');
    });
  }

  function preview(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    setCandidate(null);
    if (!file) return;
    action(async () => {
      if (file.size > 2 * 1024 * 1024) throw new Error('Choose a CSV of 2 MiB or smaller.');
      const csv = await file.text();
      const response = await checkedFetch(`${endpoints.portfolioImports}/preview`, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: csv });
      setCandidate({ csv, snapshot: await response.json(), name: file.name });
      setSelected(null);
    });
  }

  function confirm() {
    action(async () => {
      const response = await checkedFetch(endpoints.portfolioImports, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: candidate.csv });
      const result = await response.json();
      setCandidate(null); setSelected(result.id); setRevision(n => n + 1);
      setMessage(result.created ? 'Snapshot imported and saved. Live broker data is unchanged.' : 'This snapshot is already saved. No duplicate was created.');
    });
  }

  return html`<div class="page space-y-6 [&_[data-slot]]:border-border">
    <div class="page-header"><h1 class="page-title">Your data, portable</h1><p class="page-subtitle">Export your holdings and restore a Mosaic CSV on this or another instance.</p></div>
    <div class="grid gap-6 lg:grid-cols-2">
      <${Card} class="p-6 gap-4">
        <${Download} size=${20} aria-hidden="true" /><h2 class="text-lg font-semibold">Export holdings</h2>
        <p class="text-sm text-muted-foreground">Download the latest available broker holdings, including account details, quantities, prices and currencies. This is not a full backup: cash, orders, dividends, settings and credentials are excluded.</p>
        <p class="text-sm text-muted-foreground">Downloads contain full values even when privacy mode is on.</p>
        <${Button} class="self-start" disabled=${busy} onClick=${() => download()}>Download CSV</${Button}>
      </${Card}>
      <${Card} class="p-6 gap-4">
        <${Upload} size=${20} aria-hidden="true" /><h2 class="text-lg font-semibold">Import a snapshot</h2>
        <p class="text-sm text-muted-foreground">Choose a Mosaic holdings export. Review it before saving. Imported snapshots are stored separately in this instance’s database and never added to live portfolio totals.</p>
        <label for="portfolio-csv" class="text-sm font-medium">Mosaic CSV file · up to 2 MiB / 10,000 holdings</label>
        <${Input} id="portfolio-csv" type="file" accept=".csv,text/csv" disabled=${busy} onChange=${preview} />
        <p class="text-sm text-muted-foreground">Broker transaction exports and arbitrary CSV formats are not supported.</p>
      </${Card}>
    </div>
    ${busy ? html`<p role="status">Processing…</p>` : null}
    ${error ? html`<p role="alert" class="text-destructive">${error}</p>` : null}
    ${message ? html`<p role="status" class="text-sm">${message}</p>` : null}
    ${candidate ? html`<${Card} class="p-6 gap-4"><h2 class="text-lg font-semibold">Review import · ${candidate.name}</h2>
      <p class="text-sm text-muted-foreground">All rows validated. Nothing has been saved yet.</p>
      <${SnapshotTable} key=${candidate.snapshot.id} snapshot=${candidate.snapshot} visible=${visible} />
      <div class="flex gap-3"><${Button} variant="default" disabled=${busy} onClick=${confirm}>Confirm import</${Button}><${Button} disabled=${busy} onClick=${() => setCandidate(null)}>Cancel</${Button}></div>
    </${Card}>` : null}
    <${Card} class="p-6 gap-4"><div class="flex items-center gap-2"><${FileSpreadsheet} size=${20} aria-hidden="true" /><h2 class="text-lg font-semibold">Saved snapshots</h2></div>
      <p class="text-sm text-muted-foreground">Most recent 100 imports. Open a snapshot to inspect or re-export it. Snapshot prices are historical, not live quotes.</p>
      ${imports.loading ? html`<p role="status">Loading snapshots…</p>` : imports.error ? html`<div role="alert">Could not load saved snapshots. <${Button} onClick=${() => setRevision(n => n + 1)}>Retry</${Button}></div>` : !imports.data?.length ? html`<p class="text-sm text-muted-foreground">No imported snapshots yet. Download a CSV above to try a round trip.</p>` : html`<div class="space-y-2">${imports.data.map(item => html`<div key=${item.id} class="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3"><div><div class="text-sm">Snapshot ${new Date(item.snapshotAt).toLocaleString()}</div><div class="text-xs text-muted-foreground">Imported ${new Date(item.importedAt).toLocaleString()}</div></div><${Button} disabled=${busy} onClick=${() => { setSelected(item.id); setCandidate(null); }}>Open snapshot</${Button}></div>`)}</div>`}
    </${Card}>
    ${selected ? html`<${Card} class="p-6 gap-4"><h2 class="text-lg font-semibold">Imported holdings</h2>
      ${saved.loading ? html`<p role="status">Loading holdings…</p>` : saved.error ? html`<p role="alert">Could not load this snapshot. Reopen the page to retry.</p>` : saved.data?.id === selected ? html`<${SnapshotTable} key=${selected} snapshot=${saved.data} visible=${visible} /><${Button} class="self-start" disabled=${busy} onClick=${() => download(selected)}>Export this snapshot</${Button}>` : null}
    </${Card}>` : null}
  </div>`;
}
