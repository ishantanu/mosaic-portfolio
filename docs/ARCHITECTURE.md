# Architecture

## Overview

Mosaic uses a deliberately separate browser frontend and Go API.

```text
Browser frontend (localhost:5173)
        │ HTTP / JSON
        ▼
Go API (localhost:8081)
        │ authenticated HTTP
        ▼
Trading 212 API
```

The frontend never receives Trading 212 credentials. The Go service owns authentication, request timeouts and the short-lived API cache.

## Backend

`cmd/api` supports two roles. Its API server exposes JSON endpoints for the
browser client, while its CLI provides direct data-inspection and export-report
commands.

The backend follows a lightweight ports-and-adapters structure:

| Layer | Responsibility |
| --- | --- |
| `internal/domain` | Portfolio types and broker interfaces |
| `internal/application` | Portfolio aggregation use cases |
| `internal/adapters/trading212` | Trading 212 transport, pagination and mapping |
| `cmd/api` | HTTP routes, CORS, caching and process configuration |

Broker API responses are cached in memory for 15 minutes by default (`BROKER_REFRESH_INTERVAL` can change this). Each broker request has a 10-second context timeout. If a refresh is rate-limited after a successful response, Mosaic serves the last known response with `X-Cache: STALE` rather than failing the dashboard. PostgreSQL holds broker-valued portfolio snapshots; a snapshot is collected at API startup and then on the same refresh cadence.

### Observability

The browser creates a W3C trace context for each API request. The Go API extracts
it, logs a JSON completion event with the trace ID, and creates child spans for
broker HTTP calls and PostgreSQL history operations. Configure
`OTEL_EXPORTER_OTLP_ENDPOINT` (or the traces-specific equivalent) to export
these spans over OTLP/HTTP; otherwise the OpenTelemetry SDK stays disabled and
the service remains dependency-free at runtime.

## Frontend

The frontend is a responsive React 18 application using `htm` templates. It is independently served during development and calls the API through `frontend/src/api.js`.

Views are responsible for presentation and client-side derived insights. Broker identifiers remain intact for matching; display helpers convert them into exchange-style symbols for the UI.

## Deployment boundary

Deploy the frontend as static assets, the Go API and PostgreSQL as separate services. Configure the browser’s API origin with `window.__MOSAIC_API_URL__` and set `CORS_ORIGIN` on the API to the deployed frontend origin. In Docker Compose, the web port is configurable with `WEB_PORT` (default `8081`) and nginx proxies `/api` to the private API container. PostgreSQL is private to the Compose network and persists through the `mosaic_postgres` named volume.

## Container build strategy

`Dockerfile.api` uses a cached Go-module stage, a cached Go build stage and a
small non-root Alpine runtime with CA certificates. `frontend/Dockerfile` uses
a cached npm directory to build Vite assets, then copies only `dist/` into nginx.
The Compose deployment keeps the API private and lets nginx proxy `/api`.
