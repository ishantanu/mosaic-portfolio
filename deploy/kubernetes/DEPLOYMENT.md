# Production deployment guidelines

## Topology

Run the stateless web and Go API services behind a TLS ingress. Use a managed
PostgreSQL instance in the same region and private network; do not expose the
database through a public Kubernetes Service. The Ingress routes `/api`
directly to the Go API service and all other paths to the SPA service.

```text
Internet → TLS Ingress ┬→ mosaic-web (static SPA)
                       └→ mosaic-api → PostgreSQL
                                            └→ OTLP collector (optional)
```

## Security and data

Store `database-url`, `trading212-api-key` and `trading212-secret-key` in
an external secret manager or in a Kubernetes Secret created by CI. Enable
encryption at rest for Secrets and database backups, use TLS for the database
connection, and restrict that connection to the API workload. Set
`MOSAIC_DEMO_MODE=false` only after credentials and database access are
verified. Do not send financial data or credentials to browser telemetry. Use
immutable image tags, such as a Git SHA, rather than `latest`.

## Availability and broker protection

Keep `BROKER_REFRESH_INTERVAL` at 15 minutes or longer. The broker cache is
currently per API pod, so keep one API replica until shared refresh
coordination exists through PostgreSQL advisory locks or Redis. Otherwise,
replicas can multiply Trading 212 refreshes. The web workload can scale
independently; the chart includes a PDB and a zero-unavailable rolling update.

## Observability

Point `OTEL_EXPORTER_OTLP_ENDPOINT` at a cluster-local Grafana Alloy OTLP
endpoint. Deploy LGTM observability separately from the product release, with
its own persistent storage, retention and access controls. The Compose
observability stack is for local development only.

## Release procedure

```bash
helm lint ./deploy/kubernetes/mosaic
helm template mosaic ./deploy/kubernetes/mosaic -n mosaic \
  -f ./deploy/kubernetes/mosaic/values-production.yaml > /tmp/mosaic.yaml
helm upgrade --install mosaic ./deploy/kubernetes/mosaic -n mosaic \
  -f ./deploy/kubernetes/mosaic/values-production.yaml --atomic --wait
kubectl -n mosaic rollout status deployment/mosaic-api
kubectl -n mosaic rollout status deployment/mosaic-web
```

Use `helm rollback mosaic <revision> --wait` for an application rollback.
Database migrations must be backwards compatible; restore data only through a
tested managed-database backup procedure, not a Helm rollback.
