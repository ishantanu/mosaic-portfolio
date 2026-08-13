/**
 * Formatting utilities for financial values.
 */

const MASK = '••••••';

/**
 * Format a monetary amount with currency symbol.
 * @param {number|string} amount
 * @param {string} currency  ISO 4217 code, defaults to GBP
 * @param {boolean} visible  when false, returns masked placeholder
 */
export function formatMoney(amount, currency = 'GBP', visible = true) {
  if (!visible) return MASK;
  const num = parseFloat(amount);
  if (isNaN(num)) return '—';
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency || 'GBP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${currency} ${num.toFixed(2)}`;
  }
}

/**
 * Format a number with commas and fixed decimal places.
 */
export function formatNumber(value, decimals = 4, visible = true) {
  if (!visible) return MASK;
  const num = parseFloat(value);
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

/**
 * Format a P&L value with + / − prefix and colour class hint.
 * Returns { text, cls } where cls is 'gain' | 'loss' | ''
 */
export function formatPnL(amount, currency = 'GBP', visible = true) {
  if (!visible) return { text: MASK, cls: '' };
  const num = parseFloat(amount);
  if (isNaN(num)) return { text: '—', cls: '' };
  const text = (num >= 0 ? '+' : '') + formatMoney(num, currency, true);
  const cls = num > 0 ? 'gain' : num < 0 ? 'loss' : '';
  return { text, cls };
}

/**
 * Format an ISO date string to a human-readable date.
 */
export function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Format an ISO date string to date + time.
 */
export function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Derive 1–4 letter abbreviation from a ticker string for avatars.
 */
export function tickerInitials(ticker = '') {
  return ticker.replace(/[^A-Z0-9]/gi, '').slice(0, 4).toUpperCase() || '?';
}
