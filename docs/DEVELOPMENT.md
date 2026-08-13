# Development guide

## Prerequisites

Use Go 1.26.5 or later, plus Node 24.19.0 and npm 12.0.2 for the Vite frontend;
the Node version is pinned in `.nvmrc`. Live data requires Trading 212 API
credentials. Run PostgreSQL through Docker Desktop or use a compatible
PostgreSQL instance.

## API

```bash
docker compose up postgres -d
export DATABASE_URL='postgres://mosaic:mosaic_dev_only@localhost:5432/mosaic?sslmode=disable'
go run ./cmd/api serve --port 8081
go test ./...
```

Set `POSTGRES_PORT` if port `5432` is already in use. The API creates its
portfolio-history schema automatically on startup; production deployments should
provide a managed PostgreSQL `DATABASE_URL` and non-default credentials.

Useful CLI commands:

```bash
go run ./cmd/api get account-summary
go run ./cmd/api get portfolio
go run ./cmd/api get open-positions
go run ./cmd/api get transactions-history
```

## Frontend

```bash
cd frontend
nvm use
npm ci
npm run dev
```

The API base defaults to `http://localhost:8081` when the browser runs outside that port. For another environment, assign `window.__MOSAIC_API_URL__` before loading `src/main.js`.

## Quality checks

Run `go test ./...` after backend work and `npm run build` after installing
frontend dependencies. Verify loading, empty and error states as well as normal
live data. Check the mobile layout at narrow widths whenever adding a table,
chart or panel.

## Adding a broker endpoint

1. Add the transport call to the Trading 212 client.
2. Map it in the adapter or application service if it belongs to the domain model.
3. Register an API route in `cmd/api/main.go`.
4. Add the endpoint to `frontend/src/api.js`.
5. Add loading, error and empty states in the consuming view.
