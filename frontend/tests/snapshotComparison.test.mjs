import test from 'node:test';
import assert from 'node:assert/strict';
import { compareSnapshots } from '../src/snapshotComparison.js';

const holding = (props = {}) => ({ broker: 'Broker', accountId: 'account', ticker: 'ABC', symbol: 'ABC', name: 'Example', isin: 'ISIN', quantity: 2, averagePrice: 10, currentPrice: 12, costBasis: 20, currentValue: 24, fxImpact: 0, currency: 'GBP', instrumentCurrency: 'GBP', ...props });
const snapshot = (holdings, snapshotAt = '2026-09-14T12:00:00Z') => ({ holdings, snapshotAt });

test('classifies holdings and computes per-currency totals without mixing sources', () => {
  const before = snapshot([holding(), holding({ ticker: 'OLD', currentValue: 10 }), holding({ accountId: 'other', currency: 'USD', currentValue: 30 })]);
  const after = snapshot([holding({ quantity: 3, currentValue: 36 }), holding({ ticker: 'NEW', currentValue: 15 }), holding({ accountId: 'other', currency: 'USD', currentValue: 30 })]);
  const result = compareSnapshots(before, after);
  assert.deepEqual(result.counts, { added: 1, removed: 1, changed: 1, unchanged: 1 });
  assert.deepEqual(result.totals, [{ currency: 'GBP', before: 34, after: 51, delta: 17 }, { currency: 'USD', before: 30, after: 30, delta: 0 }]);
  assert.equal(result.rows.find(r => r.status === 'changed').quantityDelta, 1);
  assert.equal(result.rows.find(r => r.status === 'removed').valueDelta, -10);
});

test('a currency change never produces a cross-currency row difference', () => {
  const result = compareSnapshots(snapshot([holding()]), snapshot([holding({ currency: 'USD', currentValue: 30 })]));
  assert.equal(result.currencyChanges, 1);
  assert.equal(result.rows[0].valueDelta, null);
  assert.deepEqual(result.rows[0].changedFields, ['currentValue', 'currency']);
});

test('detects metadata and cost changes even with unchanged quantity and value', () => {
  const result = compareSnapshots(snapshot([holding()]), snapshot([holding({ name: 'Renamed', ter: .2, costBasis: 21 })]));
  assert.equal(result.counts.changed, 1);
  assert.deepEqual(result.rows[0].changedFields, ['costBasis', 'ter', 'name']);
});

test('omitted zero ratios and floating-point noise are not changes', () => {
  const result = compareSnapshots(snapshot([holding({ quantity: .1 + .2 })]), snapshot([holding({ quantity: .3, ter: 0, ocf: 0 })]));
  assert.equal(result.counts.unchanged, 1);
  assert.equal(result.rows[0].quantityDelta, 0);
});

test('rejects incomplete, duplicate, non-finite and overflowing data', () => {
  for (const bad of [null, { holdings: [] }, snapshot([holding({ quantity: null })]), snapshot([holding({ currentValue: NaN })]), snapshot([holding(), holding()]), snapshot([holding({ accountId: '' })]), snapshot([holding({ currentValue: Number.MAX_VALUE }), holding({ ticker: 'XYZ', currentValue: Number.MAX_VALUE })])]) {
    assert.throws(() => compareSnapshots(bad, snapshot([])));
  }
});

test('reversed dates are flagged and swapping reverses differences', () => {
  const a = snapshot([holding()], '2026-09-15T00:00:00Z');
  const b = snapshot([holding({ quantity: 5, currentValue: 60 })]);
  assert.equal(compareSnapshots(a, b).reversed, true);
  assert.equal(compareSnapshots(b, a).reversed, false);
  assert.equal(compareSnapshots(a, b).totals[0].delta, -compareSnapshots(b, a).totals[0].delta);
});

test('broker and account identity prevent ticker-only matching and input is not mutated', () => {
  const a = snapshot([holding()]), b = snapshot([holding({ broker: 'Other' })]);
  const copy = JSON.stringify([a, b]);
  assert.deepEqual(compareSnapshots(a, b).counts, { added: 1, removed: 1, changed: 0, unchanged: 0 });
  assert.equal(JSON.stringify([a, b]), copy);
  assert.equal(compareSnapshots(a, a).sameTime, true);
  assert.equal(compareSnapshots(snapshot([]), snapshot([])).rows.length, 0);
});
