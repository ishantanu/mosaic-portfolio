const numericFields = ['quantity', 'averagePrice', 'currentPrice', 'costBasis', 'currentValue', 'ter', 'ocf', 'fxImpact'];
const textFields = ['name', 'isin', 'symbol', 'currency', 'instrumentCurrency'];
export const holdingKey = h => JSON.stringify([h.broker, h.accountId, h.ticker]);

function equalNumber(a, b) {
  return Math.abs(a - b) <= Number.EPSILON * 8 * Math.max(1, Math.abs(a), Math.abs(b));
}

function difference(a, b) {
  const value = b - a;
  if (!Number.isFinite(value)) throw new Error('Snapshot values are too large to compare safely.');
  return equalNumber(a, b) ? 0 : value;
}

function indexSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.holdings) || !Number.isFinite(Date.parse(snapshot.snapshotAt))) {
    throw new Error('A complete, dated holdings snapshot is required for comparison.');
  }
  const indexed = new Map();
  for (const h of snapshot.holdings) {
    if (!h || ![h.broker, h.accountId, h.ticker].every(v => typeof v === 'string' && v.trim()) || !/^[A-Z]{3}$/.test(h.currency)) {
      throw new Error('A holding is missing its source identity or currency.');
    }
    for (const field of numericFields) {
      // Cost ratios are omitted by the Go JSON encoder when zero.
      const value = h[field] ?? (field === 'ter' || field === 'ocf' ? 0 : NaN);
      if (!Number.isFinite(value)) throw new Error(`A holding has an invalid ${field} value.`);
    }
    const key = holdingKey(h);
    if (indexed.has(key)) throw new Error('A snapshot contains duplicate holdings.');
    indexed.set(key, h);
  }
  return indexed;
}

// Read-only comparison of two complete imports. Missing holdings mean absent
// from that snapshot, not proof of a purchase, sale, or account transfer.
export function compareSnapshots(before, after) {
  const left = indexSnapshot(before);
  const right = indexSnapshot(after);
  const totals = new Map();
  for (const [side, holdings] of [['before', left], ['after', right]]) {
    for (const h of holdings.values()) {
      const total = totals.get(h.currency) ?? { currency: h.currency, before: 0, after: 0 };
      total[side] += h.currentValue;
      if (!Number.isFinite(total[side])) throw new Error('Snapshot totals are too large to compare safely.');
      totals.set(h.currency, total);
    }
  }
  const counts = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  const rows = [...new Set([...left.keys(), ...right.keys()])].sort().map(key => {
    const a = left.get(key), b = right.get(key);
    const changedFields = a && b ? [
      ...numericFields.filter(field => !equalNumber(a[field] ?? 0, b[field] ?? 0)),
      ...textFields.filter(field => (a[field] ?? '') !== (b[field] ?? '')),
    ] : [];
    const status = !a ? 'added' : !b ? 'removed' : changedFields.length ? 'changed' : 'unchanged';
    counts[status]++;
    const currencyChanged = !!(a && b && a.currency !== b.currency);
    return {
      key, holding: b ?? a, before: a ?? null, after: b ?? null, status, changedFields, currencyChanged,
      quantityDelta: difference(a?.quantity ?? 0, b?.quantity ?? 0),
      valueDelta: currencyChanged ? null : difference(a?.currentValue ?? 0, b?.currentValue ?? 0),
    };
  });
  return {
    rows, counts,
    totals: [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency)).map(t => ({ ...t, delta: difference(t.before, t.after) })),
    currencyChanges: rows.filter(r => r.currencyChanged).length,
    reversed: Date.parse(before.snapshotAt) > Date.parse(after.snapshotAt),
    sameTime: Date.parse(before.snapshotAt) === Date.parse(after.snapshotAt),
  };
}
