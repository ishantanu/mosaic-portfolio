---
description: Trading 212 public API integration guidance
applyTo: '**/*.go'
---

# Trading 212 API integration guidance

When wiring the Trading 212 public API into Go code, use the actual HTTP route names from the public API quickstart, not the docs page slug names.

- Use `Authorization: Basic <base64(apiKey:apiSecret)>` for every request.
- Prefer the live base URL `https://live.trading212.com/api/v0` unless the code is explicitly running in demo mode.
- For account summary, call `/equity/account/summary` rather than the docs page slug `/accounts/getaccountsummary`.
- For order history, use `/equity/history/orders` rather than `/equity/orders/history`.
- Support `TRADING212_API_KEY`, `TRADING212_SECRET_KEY`, and `TRADING212_BASE_URL` as the primary environment variables for local runs.
- Keep demo/live switching explicit by using `TRADING212_BASE_URL`; do not assume the demo host and live host share the same key pair or account semantics.

## Learnings

The public docs page path and the real HTTP API path are not interchangeable. A docs page like `https://docs.trading212.com/api/accounts/getaccountsummary` describes an operation, but the actual request target is the endpoint path in the quickstart example, such as `/equity/account/summary`.

When a request returns `404 page not found`, verify that the path is the real request route and not the docs slug. The same caution applies to order history: the docs list the resource as `/equity/history/orders`, not `/equity/orders/history`.
