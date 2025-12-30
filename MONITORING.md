# Monitoring Setup

This document explains the monitoring architecture for the Nami application.

## Architecture

The application uses Prometheus for metrics collection and Grafana for visualization.

### Services

1. **Backend Service** (runs locally on port 8080)
   - Metrics endpoint: `http://localhost:8080/metrics`
   - Started via: `make run-dev` or `make backend`

2. **AI Service** (runs locally on port 8088)
   - Metrics endpoint: `http://localhost:8088/metrics`
   - Started via: `make run-dev` or `cd ai-service && npm run dev`

3. **PostgreSQL** (runs in Docker on port 5433)
   - Started via: `make docker-up`

4. **Prometheus** (runs in Docker on port 9090)
   - Web UI: `http://localhost:9090`
   - Configuration: `ai-service/monitoring/prometheus.yml`
   - Started via: `make monitoring` or `make docker-up`

5. **Grafana** (runs in Docker on port 3001)
   - Web UI: `http://localhost:3001`
   - Default credentials: `admin/admin`
   - Started via: `make monitoring` or `make docker-up`

## Prometheus Configuration

Prometheus is configured to scrape metrics from:
- **Backend**: `host.docker.internal:8080/metrics` (runs on host)
- **AI Service**: `host.docker.internal:8088/metrics` (runs on host)

The `host.docker.internal` hostname allows Docker containers to reach services running on the host machine.

## Starting the Full Stack

To start all services with monitoring:

```bash
# Start Docker services (PostgreSQL, Prometheus, Grafana)
make docker-up

# Start application services (Backend, Frontend, AI Service)
make run-dev
```

Or simply:

```bash
make run
```

## Accessing Monitoring

- **Prometheus**: http://localhost:9090
  - View targets: http://localhost:9090/targets
  - Check if all services are "UP"

- **Grafana**: http://localhost:3001
  - Login with `admin/admin`
  - Add Prometheus as data source (usually auto-configured)
  - Import or create dashboards

## Viewing Service Logs

Service logs are written to separate files:

```bash
# View all logs
make logs

# View individual service logs
make logs-backend
make logs-frontend
make logs-ai
```

Or directly:
```bash
tail -f logs/backend.log
tail -f logs/frontend.log
tail -f logs/ai-service.log
```

## Troubleshooting

### Prometheus shows "connection refused"

1. Check if services are running:
   ```bash
   lsof -i :8080 -i :8088
   ```

2. Check if metrics endpoints are accessible:
   ```bash
   curl http://localhost:8080/metrics
   curl http://localhost:8088/metrics
   ```

3. Restart Prometheus:
   ```bash
   make docker-down
   make docker-up
   ```

### AI Service not starting

1. Check the AI service log:
   ```bash
   cat logs/ai-service.log
   ```

2. Verify configuration in `ai-service/.env`:
   - `PORT=8088`
   - `SERVICE_BASE_URL=http://localhost:8088`

3. Check if port 8088 is already in use:
   ```bash
   lsof -i :8088
   ```

## Stopping Services

```bash
# Stop all application services
make stop

# Stop Docker services
make docker-down

# Stop monitoring stack only
make monitoring-down
```

## Running AI Service in Docker (Optional)

If you want to run the AI service in Docker instead of locally:

1. Uncomment the `ai-service` section in `docker-compose.yml`
2. Update Prometheus config to use `ai-service:8081` instead of `host.docker.internal:8088`
3. Start with: `docker-compose --profile ai-service --profile monitoring up -d`

However, the recommended approach is to run it locally for easier development and debugging.
