/**
 * Centralised API endpoint registry.
 * All paths must match routes registered in cmd/api/main.go.
 */
// Set window.__MOSAIC_API_URL__ before loading the app to override this.
// Local Vite development proxies /api to Go; production nginx does the same.
const apiBase = typeof window !== 'undefined' && window.__MOSAIC_API_URL__
  ? window.__MOSAIC_API_URL__.replace(/\/$/, '')
  : '';

const api = path => apiBase + path;

export const endpoints = {
  accountSummary: api('/api/account-summary'),
  positions:      api('/api/positions'),
  orders:         api('/api/orders'),
  dividends:      api('/api/dividends'),
  transactions:   api('/api/transactions'),
  portfolio:      api('/api/portfolio'),
  portfolioHistory: api('/api/portfolio-history'),
};
