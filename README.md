# Mosaic

Mosaic gives you one clear view of your Stocks & Shares ISAs. It brings holdings, cash, performance, costs, ISA allowance use, sector exposure, ETF look-through exposure and portfolio-health signals into a single responsive dashboard.

Mosaic is an independent portfolio analytics tool. It is not a broker, does not
hold client money or assets, cannot place trades, and does not provide personal
investment advice.

> **Repository description:** Self-hosted portfolio analytics that aggregates Stocks & Shares ISA accounts with explainable costs and exposure insights.

## Demo preview

![Mosaic dashboard in demo mode](docs/assets/mosaic-demo-dashboard.png)

> **Demo figures only.** Every holding, value, return, cash balance, allowance
> figure and broker split in this screenshot is fictional. Demo mode makes no
> broker calls and must not be interpreted as real investment performance.

## What it does today

Mosaic connects to a Trading 212 Stocks & Shares ISA account, or uses safe
fictional data in demo mode without making broker calls. It presents holdings,
unrealised P/L, costs, ISA allowance use, concentration and exposure analysis.
Broker-valued portfolio snapshots are persisted in PostgreSQL, while broker
responses are cached for 15 minutes by default to protect broker limits. A
self-hosted observability stack covers API, database and browser telemetry.

Trading 212 is the only live broker integration at present. The data model is
designed to aggregate multiple brokers, but another connector is required before
Interactive Brokers, Saxo, IG, or other providers can supply live data.

## Technology

| Area | Choice |
| --- | --- |
| Web application | React-compatible components with htm, built by Vite |
| API | Go standard-library HTTP server |
| Data | PostgreSQL portfolio-history store |
| Broker integration | Trading 212 REST API |
| Containers | Docker multi-stage builds and Docker Compose |
| Observability | Grafana, Alloy, Loki, Tempo, Prometheus and Faro |
| Kubernetes | Helm chart under `deploy/kubernetes/mosaic` |

## Quick start

Mosaic requires Node `24.19.0` for frontend development and Go `1.26.5` for the
API. Docker is the simplest way to run the whole product.

### Local development with Docker Compose

Docker Compose starts the web application, Go API and PostgreSQL together. The
web application is available at `http://localhost:8081`; it serves the SPA and
proxies `/api` to the private API container. For the complete local demo used
by this project, also start the observability overlay:

```bash
MOSAIC_DEMO_MODE=true docker compose \
  -f docker-compose.yml \
  -f docker-compose.observability.yml up --build
```

Open [http://localhost:8081](http://localhost:8081) for Mosaic and
[http://localhost:3000](http://localhost:3000) for Grafana. Demo mode uses
fictional data and never calls Trading 212.

To use a real account, copy `.env.example` to a local `.env`, set
`MOSAIC_DEMO_MODE=false`, then add the Trading 212 key and secret. `.env` files
are intentionally ignored and must never be committed.

```bash
docker compose up --build
```

Set `WEB_PORT=8090` before either command to use a different local browser
port. Add `-d` to run the stack in the background and `docker compose down` to
stop it. Use `docker compose logs -f api` to follow broker refreshes and API
errors. If you only need Mosaic without Grafana and telemetry, use the shorter
`MOSAIC_DEMO_MODE=true docker compose up --build` command.

## Local development

Start PostgreSQL and the API:

```bash
docker compose up postgres -d
export DATABASE_URL='postgres://mosaic:mosaic_dev_only@localhost:5432/mosaic?sslmode=disable'
go run ./cmd/api serve --port 8081
```

In another terminal, start the frontend:

```bash
cd frontend
nvm use
npm ci
npm run dev
```

The Vite development server runs at `http://localhost:5173`; it proxies API
requests to `http://localhost:8081`. Set `MOSAIC_API_URL` for a different local
API target.

## Configuration

| Variable | Purpose |
| --- | --- |
| `MOSAIC_DEMO_MODE` | `true` uses fictional data and makes no broker calls. |
| `TRADING212_API_KEY`, `TRADING212_SECRET_KEY` | Required for a live Trading 212 connection. |
| `TRADING212_ACCOUNT_ID` | Account to read; defaults to `demo-account`. |
| `BROKER_REFRESH_INTERVAL` | Broker cache and scheduled snapshot cadence; defaults to `15m`. |
| `DATABASE_URL` | PostgreSQL connection string. |
| `WEB_PORT`, `POSTGRES_PORT`, `PORT` | Local port overrides. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Enables backend OTLP trace export. |
| `VITE_FARO_URL` | Build-time browser telemetry endpoint. |

See [`.env.example`](.env.example) for the complete local configuration list.

## Observability

The optional Compose overlay starts Grafana, Grafana Alloy, Prometheus, Loki and
Tempo. The API emits structured JSON logs, Prometheus metrics and OpenTelemetry
traces; the browser sends Faro web-vital and fetch telemetry to Alloy.

```bash
MOSAIC_DEMO_MODE=true docker compose \
  -f docker-compose.yml -f docker-compose.observability.yml up --build
```

Open Grafana at [http://localhost:3000](http://localhost:3000). The provisioned
dashboards are **Mosaic · Service Health** and **Mosaic · Frontend Experience**.
Click a `trace_id` in an API log to open the corresponding Tempo trace.

### Local dashboard previews

**Service Health.** API success ratio, route traffic, latency and trace-derived
dependencies from the fictional demo session.

![Mosaic Service Health dashboard](docs/assets/grafana-service-health.png)

**Frontend Experience.** Browser Core Web Vitals and API timing captured by
Grafana Faro. A newly started demo may show “No data” for vitals that the
browser has not yet reported.

![Mosaic Frontend Experience dashboard](docs/assets/grafana-frontend-experience.png)

## Tests and checks

```bash
go test ./...
cd frontend && npm run build
helm lint ../deploy/kubernetes/mosaic
```

## Deployment

The Helm chart deploys the stateless web and API services. It expects a managed
PostgreSQL instance and externally supplied Kubernetes Secret; it does not place
broker credentials in Helm values. The Ingress routes `/api` directly to the Go
API and all other paths to the web application.

Read the [Kubernetes quick start](deploy/kubernetes/README.md) and
[deployment guidelines](deploy/kubernetes/DEPLOYMENT.md) before deploying.

## Further reading

Read the [architecture](docs/ARCHITECTURE.md), [data and product
flows](docs/FLOWS.md), [development guide](docs/DEVELOPMENT.md), and
[calculation methods and limitations](docs/CALCULATIONS.md).
