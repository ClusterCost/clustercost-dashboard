# ClusterCost Dashboard

ClusterCost Dashboard is an open-source, local-first observability surface for real-time Kubernetes cost visibility. It runs a lightweight Go backend with an embedded React + Vite frontend, talks directly to ClusterCost agents, and ships with Docker and Kubernetes deployment assets.

## Features

- Go backend with cached polling of ClusterCost agents.
- React + Vite + Tailwind + shadcn/ui frontend focused on fast tables and charts.
- REST API: `/api/overview`, `/api/namespaces`, `/api/pods`, `/api/nodes`, `/api/workloads`, `/api/agents`, `/api/health`.
- Multi-stage Dockerfile and Kubernetes manifests for quick deployment.

## Getting Started

### Prerequisites

- Go 1.21+
- Node.js 18+
- ClusterCost agents reachable from the dashboard

### Configuration

Set agents via `CONFIG_FILE` (YAML) or a comma-separated `AGENT_URLS` env variable.

```yaml
listenAddr: ":8080"
pollInterval: 30s
agents:
  - name: prod-cluster
    baseUrl: http://clustercost-agent-k8s.prod.svc.cluster.local:8080
    type: k8s
```

Environment overrides:

| Variable        | Description                              |
| --------------- | ---------------------------------------- |
| `LISTEN_ADDR`   | HTTP listen address (default `:9090`)     |
| `POLL_INTERVAL` | Poll frequency, e.g. `30s`                |
| `CONFIG_FILE`   | Path to YAML config                       |
| `AGENT_URLS`    | Comma-separated agent base URLs (k8s)     |

### Backend

```bash
LISTEN_ADDR=:9090 go run ./cmd/dashboard
```

### Frontend

```bash
cd web
npm install
npm run dev
```

The Vite dev server proxies API calls to `localhost:8080`. When you run `npm run build`, the generated assets are automatically copied into `internal/static/dist` so the Go binary can embed the latest frontend.

### Docker

```bash
docker build -f deployments/docker/Dockerfile -t clustercost/dashboard .
docker run -p 8080:8080 clustercost/dashboard
```

### Kubernetes

Apply the ConfigMap, Deployment, and Service in `deployments/k8s/` after updating the agent URL to match your cluster.

```bash
kubectl apply -f deployments/k8s/configmap.yaml
kubectl apply -f deployments/k8s/deployment.yaml
kubectl apply -f deployments/k8s/service.yaml
```

## Project Structure

- `cmd/dashboard`: Go entrypoint.
- `internal`: configuration, agent client, cache, API handlers, static serving.
- `web`: React frontend.
- `deployments`: Docker and Kubernetes artifacts.

## License

MIT © ClusterCost
