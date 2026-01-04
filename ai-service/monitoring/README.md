# Nami Monitoring Stack

This directory contains the Prometheus and Grafana configuration for monitoring the Nami services.

## Overview

The monitoring stack consists of:

- **Prometheus**: Metrics collection and storage
- **Grafana**: Visualization and dashboards

## Services Monitored

| Service         | Port | Metrics Endpoint |
| --------------- | ---- | ---------------- |
| Backend Service | 8080 | `/metrics`       |
| AI Service      | 8081 | `/metrics`       |

## Quick Start

Start the monitoring stack using the Makefile:

```bash
# Start monitoring stack (Prometheus + Grafana)
make monitoring

# Stop monitoring stack
make monitoring-down

# View logs
make monitoring-logs
```

## Access

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (default: admin/admin)

Set the `GRAFANA_PASSWORD` environment variable to customize the Grafana admin password.

## Metrics Collected

### Backend Service Metrics

- `nami_transactions_total` - Transaction creations with type and status labels
- `nami_vault_operations_total` - Vault operations
- `nami_database_operations_total` - Database operations
- `nami_database_errors_total` - Database errors
- `nami_backend_http_*` - HTTP request metrics (via express-prom-bundle)
- Default Node.js metrics (CPU, memory, event loop, etc.)

### AI Service Metrics

- `nami_ai_telegram_messages_total` - Telegram messages processed
- `nami_ai_llm_requests_total` - LLM API requests
- `nami_ai_llm_tokens_total` - LLM tokens used
- `nami_ai_backend_requests_total` - Backend API requests
- `nami_ai_pending_actions_total` - Pending actions created
- `nami_ai_bank_statements_total` - Bank statements processed
- `nami_ai_errors_total` - Categorized errors
- `nami_ai_http_*` - HTTP request metrics (via express-prom-bundle)
- Default Node.js metrics (CPU, memory, event loop, etc.)

## Dashboards

The "Nami Service Overview" dashboard provides:

- Service status indicators
- Request rate graphs
- Error rate monitoring
- Request latency (P95)
- Database size tracking
- Transaction rate
- Telegram message rate

## Configuration

### Prometheus (`prometheus.yml`)

Scrape interval: 15 seconds
Data retention: 200 hours

### Grafana Provisioning

- **Datasources**: `./grafana/datasources/prometheus.yml`
- **Dashboards**: `./grafana/dashboards/dashboard.yml`
- **Dashboard JSON**: `./grafana/dashboards/nami-overview.json`

## Development

When running services locally with `make run-dev`, the monitoring stack can be started separately:

```bash
# Terminal 1: Start the services
make run-dev

# Terminal 2: Start monitoring
make monitoring
```

Note: Backend service runs on the host machine (not in Docker), so Prometheus accesses it via `host.docker.internal:8080`. The AI Service runs in Docker and is accessed via the service name `ai-service:8081`.
