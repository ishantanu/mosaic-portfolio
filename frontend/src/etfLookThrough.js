// Dated constituent snapshots used solely for transparent look-through
// analytics. These must be refreshed from the stated provider before their
// as-of date becomes stale; they are not market prices or trade signals.
export const ETF_LOOK_THROUGH = {
  VWRP: {
    source: 'Vanguard FTSE All-World UCITS ETF factsheet',
    asOf: '31 Mar 2026',
    holdings: [
      { company: 'NVIDIA', weight: 4.5 },
      { company: 'Apple', weight: 4.0 },
      { company: 'Alphabet', weight: 3.3 },
      { company: 'Microsoft', weight: 3.0 },
      { company: 'Amazon', weight: 2.2 },
      { company: 'Broadcom', weight: 1.6 },
      { company: 'Taiwan Semiconductor', weight: 1.5 },
      { company: 'Meta Platforms', weight: 1.4 },
      { company: 'Tesla', weight: 1.1 },
      { company: 'Berkshire Hathaway', weight: 1.0 },
    ],
  },
};

export const DIRECT_COMPANY_BY_TICKER = {
  GOOGL: 'Alphabet',
  GOOG: 'Alphabet',
  AAPL: 'Apple',
  NVDA: 'NVIDIA',
  MSFT: 'Microsoft',
  AMZN: 'Amazon',
  AVGO: 'Broadcom',
  TSM: 'Taiwan Semiconductor',
  META: 'Meta Platforms',
  TSLA: 'Tesla',
  BRK_B: 'Berkshire Hathaway',
};
