# ClusterCost Agent Integration

The dashboard polls one or more ClusterCost agents for data. Each agent exposes a small REST API under `/agent/v1/*`. This document summarizes the payloads the dashboard expects so you can wire up new agents or troubleshoot existing ones.

## Required Endpoints

### `GET /agent/v1/health`

Used to show high-level cluster metadata and connection status.

```json
{
  "status": "ok",
  "clusterId": "kubernetes",
  "clusterName": "kubernetes",
  "clusterType": "k8s",
  "clusterRegion": "us-east-2",
  "timestamp": "2025-11-17T04:18:37.713017Z",
  "version": "dev"
}
```

Only `status`, `clusterId`, and `timestamp` are strictly required, but providing the optional fields unlocks nicer UI badges (cluster name, type, region, version).

### `GET /agent/v1/namespaces`

Returns namespace-level cost + utilization data:

```json
{
  "items": [
    {
      "clusterId": "kubernetes",
      "namespace": "payments",
      "hourlyCost": 12.34,
      "podCount": 42,
      "cpuRequestMilli": 13000,
      "cpuUsageMilli": 8900,
      "memoryRequestBytes": 34359738368,
      "memoryUsageBytes": 21474836480,
      "labels": { "environment": "prod" },
      "environment": "production"
    }
  ],
  "timestamp": "2025-11-17T04:05:06.310104Z"
}
```

### `GET /agent/v1/nodes`

Provides node-level cost/utilization snapshots:

```json
{
  "items": [
    {
      "clusterId": "kubernetes",
      "nodeName": "ip-10-0-0-10",
      "hourlyCost": 3.2,
      "cpuUsagePercent": 63.4,
      "memoryUsagePercent": 71.2,
      "cpuAllocatableMilli": 16000,
      "memoryAllocatableBytes": 68719476736,
      "podCount": 52,
      "status": "Ready",
      "isUnderPressure": false,
      "instanceType": "m6i.4xlarge",
      "labels": {
        "topology.kubernetes.io/zone": "us-east-2a"
      }
    }
  ],
  "timestamp": "2025-11-17T04:05:06.310104Z"
}
```

### `GET /agent/v1/resources`

Cluster-wide CPU & memory efficiency summary plus namespace waste list:

```json
{
  "snapshot": {
    "cpuUsageMilliTotal": 56000,
    "cpuRequestMilliTotal": 88000,
    "memoryUsageBytesTotal": 30000000000,
    "memoryRequestBytesTotal": 52000000000,
    "totalNodeHourlyCost": 42.8
  },
  "timestamp": "2025-11-17T04:05:06.310104Z",
  "cpu": {
    "usageMilli": 56000,
    "requestMilli": 88000,
    "efficiencyPercent": 64,
    "estimatedHourlyWasteCost": 7.5
  },
  "memory": {
    "usageBytes": 30000000000,
    "requestBytes": 52000000000,
    "efficiencyPercent": 58,
    "estimatedHourlyWasteCost": 9.3
  },
  "namespaceWaste": [
    {
      "namespace": "payments",
      "environment": "production",
      "cpuWastePercent": 41,
      "memoryWastePercent": 34,
      "estimatedHourlyWasteCost": 2.1
    }
  ]
}
```

## Configuring Agents

You can point the dashboard at multiple agents via `CONFIG_FILE` or `AGENT_URLS`. Each entry represents the base URL; the dashboard automatically appends `/agent/v1/*`:

```bash
AGENT_URLS=http://localhost:8080 LISTEN_ADDR=:9090 go run ./cmd/dashboard
```

or

```yaml
agents:
  - name: prod-us-east
    baseUrl: https://agent-prod.example.com
    type: k8s
```

## Troubleshooting

- Use `curl http://agent-url/agent/v1/health` to verify connectivity.
- The dashboard logs polling errors; run `go run ./cmd/dashboard` to see them live.
- Missing optional fields fall back to sensible defaults (e.g., cluster name defaults to `clusterId`), but providing them gives richer UI chips and metadata.

Refer back to these schemas whenever you build or update an agent so the dashboard keeps rendering accurate, beautiful data.
