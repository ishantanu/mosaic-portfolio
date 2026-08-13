# Kubernetes deployment

This directory contains the Mosaic Helm chart and deployment guidance. The
chart deploys the stateless Go API and web application. The Ingress routes
`/api` directly to the API service and all other paths to the web service. It deliberately does
not run PostgreSQL in-cluster by default: use a managed PostgreSQL service with
backups, point-in-time recovery and a private network endpoint.

## Install

Create a namespace and a secret. Never put broker credentials or a database
URL in `values.yaml`.

```bash
kubectl create namespace mosaic
kubectl -n mosaic create secret generic mosaic-secrets \
  --from-literal=database-url='postgres://…?sslmode=require' \
  --from-literal=trading212-api-key='…' \
  --from-literal=trading212-secret-key='…'

helm upgrade --install mosaic ./deploy/kubernetes/mosaic \
  --namespace mosaic \
  --values ./deploy/kubernetes/mosaic/values-production.yaml \
  --set api.image.repository=registry.example.com/mosaic-api \
  --set api.image.tag=sha-<git-sha> \
  --set web.image.repository=registry.example.com/mosaic-web \
  --set web.image.tag=sha-<git-sha>
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for rollout, security, database, backup and
observability guidance.
