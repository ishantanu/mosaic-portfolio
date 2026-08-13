/**
 * Normalize API payloads into display-friendly shapes.
 * Handles both domain portfolio holdings and raw Trading 212 position objects.
 */

export function normalizeHolding(holding = {}) {
  const ticker = holding.ticker ?? holding.symbol ?? holding.instrument?.ticker ?? '—';
  const name = instrumentDisplayName(holding, ticker);
  const qty = holding.quantity ?? 0;
  const currency = holding.currency ?? holding.walletImpact?.currency ?? 'GBP';
  const instrumentCurrency = holding.instrumentCurrency ?? holding.instrument?.currency ?? currency;
  const broker = holding.broker ?? holding.source?.broker ?? '';
  const accountId = holding.accountId ?? holding.accountID ?? holding.source?.accountId ?? '';

  const totalCost = holding.costBasis ?? holding.walletImpact?.totalCost;
  const currentValue = holding.currentValue ?? holding.walletImpact?.currentValue;
  const pnlRaw = holding.walletImpact?.unrealizedProfitLoss ??
    (totalCost != null && currentValue != null ? currentValue - totalCost : 0);
  const fxImpact = holding.fxImpact ?? holding.walletImpact?.fxImpact ?? 0;

  let avgPrice = holding.averagePrice ?? holding.averagePricePaid ?? 0;
  let curPrice = holding.currentPrice ?? 0;

  // Average/current prices are quoted in instrumentCurrency; wallet totals are
  // in currency. Only derive a price when an API has not supplied one, so a
  // USD quote is never displayed as though it were a GBP quote.
  if (qty > 0 && !avgPrice && totalCost != null) avgPrice = totalCost / qty;
  if (qty > 0 && !curPrice && currentValue != null) curPrice = currentValue / qty;

  const curValue = currentValue ?? (curPrice * qty);

  const quoteCurrency = String(instrumentCurrency).toUpperCase();
  const accountCurrency = String(currency).toUpperCase();
  const isForeignCurrency = !['GBP', 'GBX'].includes(quoteCurrency) && quoteCurrency !== accountCurrency;
  // An indicative account-currency rate derived from the broker's current
  // wallet valuation. It is not a trade execution rate or an official FX rate.
  const quoteValue = quoteCurrency === 'GBX' ? curPrice * qty / 100 : curPrice * qty;
  const impliedFxRate = isForeignCurrency && quoteValue > 0 ? curValue / quoteValue : null;
  const entryQuoteValue = quoteCurrency === 'GBX' ? avgPrice * qty / 100 : avgPrice * qty;
  const impliedEntryFxRate = isForeignCurrency && entryQuoteValue > 0 ? Number(totalCost ?? 0) / entryQuoteValue : null;
  // Trading 212 publishes a 0.15% conversion fee. Do not apply its fee model
  // to another broker: IBKR's conversion pricing is different and its feed is
  // not yet integrated with Mosaic.
  const usesTrading212FXFeeEstimate = isForeignCurrency && /trading\s*212/i.test(String(broker));
  const estimatedExitFxFee = usesTrading212FXFeeEstimate ? curValue * 0.0015 : 0;

  return { ticker, name, qty, avgPrice, curPrice, curValue, currency, instrumentCurrency, broker, accountId, pnlRaw, fxImpact, isForeignCurrency, impliedFxRate, impliedEntryFxRate, usesTrading212FXFeeEstimate, estimatedExitFxFee };
}

export function normalizePosition(position = {}) {
  return normalizeHolding(position);
}

// A ticker can legitimately appear in more than one linked broker account.
// Keep source identity in UI keys and selection state rather than collapsing it.
export function holdingIdentity(holding = {}) {
  const item = normalizeHolding(holding);
  return [item.broker || 'unknown-broker', item.accountId || 'unknown-account', item.ticker || item.name].join(':');
}

// Trading 212 identifiers include a market suffix (for example `SSLNl_EQ`).
// Keep the raw identifier for API matching, but render the familiar exchange
// symbol customers recognise in the interface.
export function displayTicker(ticker = '') {
  return String(ticker)
    .replace(/_[A-Z]{2}_EQ$/i, '')
    .replace(/l?_EQ$/i, '');
}

// Broker tickers are useful identifiers, but not customer-facing names.
// Prefer the broker's instrument name and only retain aliases where its label
// is unnecessarily formal for the product UI.
const INSTRUMENT_ALIASES = {
  RPII_EQ: 'Raspberry Pi',
};

export function instrumentDisplayName(instrument = {}, ticker) {
  const symbol = ticker ?? instrument.ticker ?? instrument.symbol ?? instrument.instrument?.ticker ?? '—';
  return INSTRUMENT_ALIASES[symbol]
    ?? instrument.name
    ?? instrument.instrument?.name
    ?? symbol;
}
