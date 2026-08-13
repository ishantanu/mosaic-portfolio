# Portfolio calculations and limitations

## Unrealised profit/loss

For open holdings, Mosaic derives unrealised P/L from current value minus cost basis when both are available. Closed-position gains and losses are excluded.

## Rate of return

A portfolio return that matches a broker’s money-weighted return requires its complete valuation history, including intra-day valuation treatment and all account cash flows. Trading 212’s public historical endpoints do not expose that valuation series. Mosaic therefore does not present a broker-equivalent return figure as if it were exact.

## ISA allowance tracker

The tracker counts connected-account deposits in the current tax year against the standard adult ISA allowance. It cannot see subscriptions with other providers, ISA-transfer rules, flexible-ISA withdrawals or account-wrapper eligibility. It is guidance only, not an HMRC compliance determination.

## Effective exposure

ETF look-through is a snapshot calculation. Constituent weights change, some funds hold thousands of securities and issuer reports may aggregate share classes. The map is suitable for identifying potential overlap and concentration, not for execution decisions.

## Estimated cost of ownership

The panel distinguishes known current fund TER/OCF, zero-value published
platform, custody and share or ETF dealing costs where applicable, conditional
FX conversion estimates, and assumption-based cash drag.

Taxes, levies, bid/ask execution variation, future trading frequency and other-provider charges are not fully knowable from current API data. Always use the broker’s order-review cost disclosure and annual costs-and-charges statement as the authoritative record.
