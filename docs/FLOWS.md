# Product and data flows

## Account refresh

1. A view requests one of the frontend endpoint constants.
2. The Go API serves a cache hit or requests Trading 212.
3. The adapter normalises the upstream response into domain or broker-response objects.
4. The browser renders the result and derives display metrics.

## Dashboard

The dashboard combines account summary, portfolio, orders and transactions to
show total value, cash, invested value and unrealised result, weighted fund
TER/OCF, an ISA allowance estimate for the current 6 April to 5 April tax year,
orders over the selected period, and sector exposure with holdings.

## Effective exposure

Effective exposure combines:

```text
direct company weight
  +
ETF market-value weight × published constituent weight
  = effective company weight
```

The current implementation uses a dated, published VWRP constituent snapshot. It is intentionally labelled partial until a full issuer-holdings import is introduced.

## Overlap

ETF overlap finds companies that appear both as direct holdings and as mapped ETF constituents. The displayed percentage is the indirect company exposure as a share of the current invested portfolio.

## Cost outlook

Cost outlook separates known broker charges from estimates. Platform, custody and Trading 212 share/ETF dealing charges are shown as zero where applicable. Fund TER/OCF is weighted by current holding value. FX and cash-drag figures are assumptions and must not be treated as a statement of fees paid.
