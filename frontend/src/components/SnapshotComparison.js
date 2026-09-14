import { html, useMemo, useState } from '../react.js';
import { ArrowLeftRight } from 'lucide-react';
import { Button, Card, Table } from './ui/compat.js';
import { Badge } from './ui/badge.jsx';
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table.jsx';
import { useApi } from '../useApi.js';
import { endpoints } from '../api.js';
import { compareSnapshots } from '../snapshotComparison.js';

const labels = { quantity: 'quantity', averagePrice: 'average price', currentPrice: 'price', costBasis: 'cost basis', currentValue: 'value', ter: 'TER', ocf: 'OCF', fxImpact: 'FX impact', name: 'name', isin: 'ISIN', symbol: 'symbol', currency: 'value currency', instrumentCurrency: 'quote currency' };
const date = value => new Date(value).toLocaleString();

function ComparisonResults({ result, visible }) {
  const [changesOnly, setChangesOnly] = useState(true);
  const [page, setPage] = useState(0);
  const rows = result.rows.filter(r => !changesOnly || r.status !== 'unchanged');
  const number = (value, signed = false) => !visible ? '••••' : value.toLocaleString(undefined, { maximumFractionDigits: 8, signDisplay: signed ? 'exceptZero' : 'auto' });
  const value = h => h ? `${number(h.currentValue)} ${h.currency}` : 'Not present';
  return html`<div class="space-y-4">
    ${result.reversed ? html`<p role="status" class="text-sm">The “To” snapshot is older than “From”. Differences run backwards in time; swap the snapshots for chronological order.</p>` : null}
    ${result.sameTime ? html`<p class="text-sm text-muted-foreground">These snapshots have the same timestamp. You are comparing their contents, not a time period.</p>` : null}
    <div class="flex flex-wrap gap-2">${Object.entries(result.counts).map(([status, count]) => html`<${Badge} key=${status} variant="secondary">${count} ${status}</${Badge}>`)}</div>
    <h3 class="font-medium">Snapshot values by currency</h3>
    <${Table}><${TableHeader}><${TableRow}>${['Currency', 'From', 'To', 'Difference'].map(s => html`<${TableHead} key=${s}>${s}</${TableHead}>`)}</${TableRow}></${TableHeader}>
      <${TableBody}>${result.totals.map(t => html`<${TableRow} key=${t.currency}><${TableCell}>${t.currency}</${TableCell}><${TableCell}>${number(t.before)}</${TableCell}><${TableCell}>${number(t.after)}</${TableCell}><${TableCell}>${number(t.delta, true)}</${TableCell}></${TableRow}>`)}</${TableBody}>
    </${Table}>
    ${result.currencyChanges ? html`<p role="status" class="text-sm">${result.currencyChanges} holding(s) changed value currency. Their row-level value differences are unavailable; currency totals include the amounts in each snapshot’s original currency.</p>` : null}
    <div class="flex flex-wrap items-center justify-between gap-3"><h3 class="font-medium">Holding changes</h3><${Button} aria-pressed=${changesOnly} onClick=${() => { setChangesOnly(v => !v); setPage(0); }}>${changesOnly ? 'Show unchanged holdings' : 'Show changes only'}</${Button}></div>
    ${!rows.length ? html`<p class="text-sm text-muted-foreground">${changesOnly ? 'No holding changes between these snapshots.' : 'Neither snapshot contains holdings.'}</p>` : html`<${Table}>
      <${TableHeader}><${TableRow}>${['Holding / source', 'Status', 'Quantity: from → to', 'Quantity Δ', 'Value: from → to', 'Value Δ'].map(s => html`<${TableHead} key=${s}>${s}</${TableHead}>`)}</${TableRow}></${TableHeader}>
      <${TableBody}>${rows.slice(page * 50, (page + 1) * 50).map(r => html`<${TableRow} key=${r.key}>
        <${TableCell}><strong>${r.holding.ticker}</strong><div>${r.holding.name}</div><div class="text-xs text-muted-foreground">${r.holding.broker} · ${visible ? r.holding.accountId : '••••'}</div></${TableCell}>
        <${TableCell}><${Badge} variant="outline">${r.status}</${Badge}>${r.changedFields.length ? html`<div class="mt-1 text-xs text-muted-foreground">${r.changedFields.map(f => labels[f]).join(', ')}</div>` : null}</${TableCell}>
        <${TableCell}>${r.before ? number(r.before.quantity) : 'Not present'} → ${r.after ? number(r.after.quantity) : 'Not present'}</${TableCell}>
        <${TableCell}>${number(r.quantityDelta, true)}</${TableCell}>
        <${TableCell}>${value(r.before)} → ${value(r.after)}</${TableCell}>
        <${TableCell}>${r.valueDelta === null ? 'Currency changed' : `${number(r.valueDelta, true)} ${r.holding.currency}`}</${TableCell}>
      </${TableRow}>`)}</${TableBody}>
    </${Table}>`}
    ${rows.length > 50 ? html`<div class="flex items-center gap-3"><${Button} disabled=${page === 0} onClick=${() => setPage(p => p - 1)}>Previous changes</${Button}><span class="text-sm">Page ${page + 1} of ${Math.ceil(rows.length / 50)}</span><${Button} disabled=${(page + 1) * 50 >= rows.length} onClick=${() => setPage(p => p + 1)}>Next changes</${Button}></div>` : null}
  </div>`;
}

export default function SnapshotComparison({ snapshots, visible }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [retry, setRetry] = useState(0);
  const left = useApi(from ? `${endpoints.portfolioImports}?id=${encodeURIComponent(from)}` : null, retry);
  const right = useApi(to ? `${endpoints.portfolioImports}?id=${encodeURIComponent(to)}` : null, retry);
  const ready = from && to && from !== to && left.data?.id === from && right.data?.id === to && !left.loading && !right.loading && !left.error && !right.error;
  const comparison = useMemo(() => {
    if (!ready) return null;
    try { return { result: compareSnapshots(left.data, right.data) }; }
    catch (err) { return { error: err.message }; }
  }, [ready, left.data, right.data]);
  return html`<${Card} class="p-6 gap-4" aria-label="Snapshot comparison">
    <div class="flex items-center gap-2"><${ArrowLeftRight} size=${20} aria-hidden="true" /><h2 class="text-lg font-semibold">Compare snapshots</h2></div>
    <p class="text-sm text-muted-foreground">Choose a “From” and “To” snapshot. Holdings match by broker, account and ticker. Compare snapshots covering the same accounts for a meaningful comparison.</p>
    <p class="text-sm text-muted-foreground">Value differences are not investment returns: they can include quantity, price, currency or account-coverage changes. Added/removed means present/absent, not a confirmed trade. No currency conversion is performed.</p>
    ${snapshots.length < 2 ? html`<p class="text-sm">Import at least two distinct snapshots to compare them.</p>` : html`
      <div class="max-h-64 overflow-auto rounded-md border border-border" tabindex="0" aria-label="Choose snapshots">
        <${Table}><${TableHeader}><${TableRow}><${TableHead}>Snapshot</${TableHead}><${TableHead}>From</${TableHead}><${TableHead}>To</${TableHead}></${TableRow}></${TableHeader}>
          <${TableBody}>${snapshots.map(s => html`<${TableRow} key=${s.id}><${TableCell}>${date(s.snapshotAt)}<div class="text-xs text-muted-foreground">Imported ${date(s.importedAt)} · ${s.id.slice(0, 8)}</div></${TableCell}>
            <${TableCell}><${Button} variant=${from === s.id ? 'default' : 'outline'} aria-pressed=${from === s.id} aria-label=${`Use ${date(s.snapshotAt)} ${s.id.slice(0, 8)} as From`} onClick=${() => setFrom(s.id)}>${from === s.id ? 'Selected' : 'Set From'}</${Button}></${TableCell}>
            <${TableCell}><${Button} variant=${to === s.id ? 'default' : 'outline'} aria-pressed=${to === s.id} aria-label=${`Use ${date(s.snapshotAt)} ${s.id.slice(0, 8)} as To`} onClick=${() => setTo(s.id)}>${to === s.id ? 'Selected' : 'Set To'}</${Button}></${TableCell}>
          </${TableRow}>`)}</${TableBody}>
        </${Table}>
      </div>
      <div class="flex flex-wrap items-center gap-3"><${Button} disabled=${!from || !to || from === to} onClick=${() => { setFrom(to); setTo(from); }}>Swap snapshots</${Button}><${Button} disabled=${!from && !to} onClick=${() => { setFrom(''); setTo(''); }}>Clear selection</${Button}></div>
      ${!from || !to ? html`<p role="status" class="text-sm">Select ${!from && !to ? 'both snapshots' : !from ? 'a From snapshot' : 'a To snapshot'} to see changes.</p>` : from === to ? html`<p role="status" class="text-sm">Choose two different snapshots.</p>` : left.error || right.error ? html`<div role="alert">Could not load both snapshots. No comparison is shown. <${Button} onClick=${() => setRetry(n => n + 1)}>Retry comparison</${Button}></div>` : !ready ? html`<p role="status">Loading both snapshots…</p>` : comparison?.error ? html`<p role="alert">${comparison.error}</p>` : html`<${ComparisonResults} key=${`${from}:${to}`} result=${comparison.result} visible=${visible} />`}
    `}
  </${Card}>`;
}
