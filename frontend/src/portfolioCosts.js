import { displayTicker, normalizeHolding } from './normalize.js';

export const FUND_TER_BY_TICKER = Object.freeze({
  VWRP: 0.19,
  WLDS: 0.35,
  SEMI: 0.35,
  SSLN: 0.12,
  SGLN: 0.12,
});

export function fundChargeForHolding(holding = {}) {
  const suppliedCharge = holding.ter
    ?? holding.ocf
    ?? holding.instrument?.ter
    ?? holding.instrument?.ocf;

  if (suppliedCharge != null && Number.isFinite(Number(suppliedCharge))) {
    return Number(suppliedCharge);
  }

  const ticker = displayTicker(normalizeHolding(holding).ticker).toUpperCase();
  return FUND_TER_BY_TICKER[ticker] ?? null;
}

export function annualFundCost(holdings = []) {
  return holdings.reduce((total, holding) => {
    const charge = fundChargeForHolding(holding);
    if (charge == null) return total;
    return total + normalizeHolding(holding).curValue * charge / 100;
  }, 0);
}
