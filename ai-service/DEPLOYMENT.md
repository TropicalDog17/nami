# Deployment Guide

This guide covers deploying the Nami AI Service to various environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Local Development](#local-development)
- [Docker Deployment](#docker-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Production Configuration](#production-configuration)
- [Monitoring and Logging](#monitoring-and-logging)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Software
- Node.js 18+
- Docker 20+ (for containerized deployment)
- kubectl (for Kubernetes deployment)

### Required Services
- OpenAI API account with GPT-4 Vision access
- Telegram Bot token
- Backend API service
- Reverse proxy (nginx/traefik) for production

## Environment Setup

### 1. Environment Variables

Create environment-specific configuration files:

```bash
# .env.development
NODE_ENV=development
PORT=8081
LOG_LEVEL=debug
TELEGRAM_WEBHOOK_MODE=false
TELEGRAM_DRY_RUN=true

# .env.staging
NODE_ENV=staging
PORT=8081
LOG_LEVEL=info
TELEGRAM_WEBHOOK_MODE=true
TELEGRAM_DRY_RUN=false

# .env.production
NODE_ENV=production
PORT=8081
LOG_LEVEL=warn
TELEGRAM_WEBHOOK_MODE=true
TELEGRAM_DRY_RUN=false
```

### 2. Secrets Management

Never commit secrets to version control. Use one of:

**Environment Variables:**
```bash
export TELEGRAM_BOT_TOKEN="your_token"
export OPENAI_API_KEY="your_key"
export BACKEND_SIGNING_SECRET="your_secret"
```

**Docker Secrets:**
```yaml
services:
  ai-service:
    secrets:
      - telegram_bot_token
      - openai_api_key
      - backend_signing_secret

secrets:
  telegram_bot_token:
    external: true
  openai_api_key:
    external: true
  backend_signing_secret:
    external: true
```

**Kubernetes Secrets:**
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: ai-service-secrets
type: Opaque
data:
  TELEGRAM_BOT_TOKEN: <base64-encoded-token>
  OPENAI_API_KEY: <base64-encoded-key>
  BACKEND_SIGNING_SECRET: <base64-encoded-secret>
```

## Local Development

### 1. Setup

```bash
# Clone repository
git clone <repository-url>
cd ai-service

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.development
```

### 2. Configure Development

Edit `.env.development`:
```env
# Development configuration
NODE_ENV=development
PORT=8081
LOG_LEVEL=debug

# Bot configuration (get from BotFather)
TELEGRAM_BOT_TOKEN=your_dev_bot_token
ALLOWED_CHAT_IDS=your_chat_id

# API keys
OPENAI_API_KEY=your_openai_key
BACKEND_BASE_URL=http://localhost:3000
BACKEND_SIGNING_SECRET=dev_secret_16_chars
SERVICE_BASE_URL=http://localhost:8081

# Development mode
TELEGRAM_WEBHOOK_MODE=false
TELEGRAM_DRY_RUN=false
```

### 3. Run Development Server

```bash
# Start with hot reload
npm run dev

# Or build and run
npm run build
npm start
```

### 4. Test Locally

```bash
# Health check
curl http://localhost:8081/healthz

# Test with webhook (requires ngrok or similar)
ngrok http 8081
# Update SERVICE_BASE_URL and set TELEGRAM_WEBHOOK_MODE=true
```

## Docker Deployment

### 1. Build Image

```bash
# Local build
docker build -t nami-ai-service:latest .

# With build arguments
docker build \
  --build-arg NODE_ENV=production \
  --build-arg VERSION=1.0.0 \
  -t nami-ai-service:1.0.0 .
```

### 2. Run Container

```bash
# Simple run
docker run -d \
  --name nami-ai-service \
  -p 8081:8081 \
  --env-file .env.production \
  nami-ai-service:latest

# With health check
docker run -d \
  --name nami-ai-service \
  -p 8081:8081 \
  --health-interval=30s \
  --health-timeout=10s \
  --health-retries=3 \
  --health-cmd="curl -f http://localhost:8081/healthz || exit 1" \
  --env-file .env.production \
  nami-ai-service:latest
```

### 3. Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  ai-service:
    build: .
    image: nami-ai-service:latest
    container_name: nami-ai-service
    restart: unless-stopped
    ports:
      - "8081:8081"
    environment:
      - NODE_ENV=production
      - PORT=8081
      - LOG_LEVEL=info
    env_file:
      - .env.production
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8081/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - ai-network

  # Optional: Redis for caching
  redis:
    image: redis:7-alpine
    container_name: nami-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    networks:
      - ai-network

networks:
  ai-network:
    driver: bridge

volumes:
  redis-data:
```

```bash
# Deploy with compose
docker-compose up -d

# View logs
docker-compose logs -f ai-service

# Scale (if needed)
docker-compose up -d --scale ai-service=3
```

## Kubernetes Deployment

### 1. Namespace

```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: nami
```

### 2. ConfigMap

```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ai-service-config
  namespace: nami
data:
  NODE_ENV: "production"
  PORT: "8081"
  LOG_LEVEL: "info"
  DEFAULT_TIMEZONE: "Asia/Ho_Chi_Minh"
  TELEGRAM_WEBHOOK_MODE: "true"
  BACKEND_BASE_URL: "http://backend-service:3000"
  SERVICE_BASE_URL: "https://ai-service.example.com"
```

### 3. Secrets

```yaml
# secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: ai-service-secrets
  namespace: nami
type: Opaque
data:
  TELEGRAM_BOT_TOKEN: <base64-encoded>
  OPENAI_API_KEY: <base64-encoded>
  BACKEND_SIGNING_SECRET: <base64-encoded>
  ALLOWED_CHAT_IDS: <base64-encoded>
```

### 4. Deployment

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ai-service
  namespace: nami
  labels:
    app: ai-service
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ai-service
  template:
    metadata:
      labels:
        app: ai-service
    spec:
      containers:
      - name: ai-service
        image: nami-ai-service:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 8081
        envFrom:
        - configMapRef:
            name: ai-service-config
        - secretRef:
            name: ai-service-secrets
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /healthz
            port: 8081
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /ready
            port: 8081
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
```

### 5. Service

```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: ai-service
  namespace: nami
spec:
  selector:
    app: ai-service
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8081
  type: ClusterIP
```

### 6. Ingress

```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ai-service-ingress
  namespace: nami
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  tls:
  - hosts:
    - ai-service.example.com
    secretName: ai-service-tls
  rules:
  - host: ai-service.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: ai-service
            port:
              number: 80
```

### 7. Deploy to Kubernetes

```bash
# Apply all configurations
kubectl apply -f namespace.yaml
kubectl apply -f configmap.yaml
kubectl apply -f secrets.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f ingress.yaml

# Check deployment
kubectl get pods -n nami
kubectl logs -f deployment/ai-service -n nami

# Port forward for testing
kubectl port-forward service/ai-service 8081:80 -n nami
```

## Production Configuration

### 1. Performance Tuning

```env
# Production optimizations
NODE_ENV=production
LOG_LEVEL=warn

# Connection limits
UV_THREADPOOL_SIZE=16
NODE_OPTIONS="--max-old-space-size=512"

# Rate limiting considerations
# Consider adding rate limiting middleware
```

### 2. Reverse Proxy (nginx)

```nginx
server {
    listen 80;
    server_name ai-service.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ai-service.example.com;

    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;

    location / {
        proxy_pass http://localhost:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check endpoint (no rate limiting)
    location /healthz {
        proxy_pass http://localhost:8081;
        access_log off;
    }
}
```

### 3. Monitoring Setup

```yaml
# prometheus-config.yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'ai-service'
    static_configs:
      - targets: ['ai-service:8081']
    metrics_path: /metrics
    scrape_interval: 30s
```

## Monitoring and Logging

### 1. Log Aggregation

**Structured Logging Format:**
```json
{
  "level": "info",
  "time": "2025-01-01T12:00:00.000Z",
  "pid": 1,
  "hostname": "ai-service-1",
  "service": "nami-ai-service",
  "correlationId": "req-abc123",
  "msg": "Processing text message",
  "chatId": 123456789,
  "textLength": 42
}
```

**ELK Stack Integration:**
```yaml
# docker-compose.monitoring.yml
version: '3.8'

services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.5.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    ports:
      - "9200:9200"

  logstash:
    image: docker.elastic.co/logstash/logstash:8.5.0
    ports:
      - "5044:5044"
    volumes:
      - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf

  kibana:
    image: docker.elastic.co/kibana/kibana:8.5.0
    ports:
      - "5601:5601"
    environment:
      ELASTICSEARCH_HOSTS: http://elasticsearch:9200
```

### 2. Metrics Collection

**Custom Metrics:**
```javascript
// Add to src/metrics.ts
import { register, Counter, Histogram, Gauge } from 'prom-client'

export const requestCounter = new Counter({
  name: 'ai_service_requests_total',
  help: 'Total number of requests',
  labelNames: ['method', 'route', 'status']
})

export const responseTime = new Histogram({
  name: 'ai_service_response_time_seconds',
  help: 'Response time in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
})

export const activeConnections = new Gauge({
  name: 'ai_service_active_connections',
  help: 'Number of active connections'
})
```

### 3. Alerting

**Prometheus Alerts:**
```yaml
# alerts.yml
groups:
- name: ai-service
  rules:
  - alert: HighErrorRate
    expr: rate(ai_service_requests_total{status=~"5.."}[5m]) > 0.1
    for: 2m
    labels:
      severity: warning
    annotations:
      summary: High error rate detected

  - alert: HighResponseTime
    expr: histogram_quantile(0.95, rate(ai_service_response_time_seconds_bucket[5m])) > 5
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: High response time detected

  - alert: ServiceDown
    expr: up{job="ai-service"} == 0
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: AI service is down
```

## Security Considerations

### 1. API Security

```typescript
// Add rate limiting middleware
import rateLimit from 'express-rate-limit'

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
})

app.use('/api/', limiter)
```

### 2. Input Validation

```typescript
// Add request validation
import { body, validationResult } from 'express-validator'

app.post('/telegram/webhook', [
  body('update_id').isNumeric(),
  body('message.message_id').isNumeric(),
], (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() })
  }
  // Process request
})
```

### 3. Security Headers

```typescript
import helmet from 'helmet'

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}))
```

## Troubleshooting

### Common Deployment Issues

**Container won't start:**
```bash
# Check logs
docker logs nami-ai-service
kubectl logs deployment/ai-service -n nami

# Check configuration
docker exec -it nami-ai-service env | grep TELEGRAM
```

**Health check failing:**
```bash
# Test locally
curl -v http://localhost:8081/healthz

# Check network connectivity
docker exec -it nami-ai-service curl -v http://backend:3000/admin/accounts
```

**Memory issues:**
```bash
# Check memory usage
docker stats nami-ai-service
kubectl top pods -n nami

# Monitor Node.js memory
docker exec -it nami-ai-service node --inspect=0.0.0.0:9229
```

**Telegram bot not responding:**
```bash
# Verify bot token
curl https://api.telegram.org/bot<YOUR_TOKEN>/getMe

# Check webhook status
curl https://api.telegram.org/bot<YOUR_TOKEN>/getWebhookInfo

# Test webhook delivery
curl -X POST https://your-domain.com/telegram/webhook \
  -H "Content-Type: application/json" \
  -d '{"update_id":1,"message":{"message_id":1,"chat":{"id":YOUR_CHAT_ID},"text":"test"}}'
```

### Performance Issues

**High response times:**
```bash
# Profile Node.js application
docker exec -it nami-ai-service node --prof app.js

# Analyze heap dump
docker exec -it nami-ai-service node --heap-prof app.js
```

**Database connection issues:**
```bash
# Check backend connectivity
docker exec -it nami-ai-service curl -v $BACKEND_BASE_URL/health

# Test with timeout
timeout 10 curl -v $BACKEND_BASE_URL/admin/accounts
```

### Log Analysis

**Filter logs by correlation ID:**
```bash
# Docker logs
docker logs nami-ai-service | grep "correlationId"

# Kubernetes logs
kubectl logs -f deployment/ai-service -n nami | grep "correlationId"

# JSON log parsing
docker logs nami-ai-service | jq 'select(.correlationId == "req-abc123")'
```

**Error analysis:**
```bash
# Count error types
docker logs nami-ai-service | grep "ERROR" | jq -r '.category' | sort | uniq -c

# Recent errors
docker logs nami-ai-service --since=1h | grep "ERROR" | tail -20
```

## Backup and Recovery

### Configuration Backup

```bash
# Export Kubernetes configurations
kubectl get configmap ai-service-config -n nami -o yaml > config-backup.yaml
kubectl get secret ai-service-secrets -n nami -o yaml > secrets-backup.yaml

# Docker compose backup
docker-compose config > docker-compose-backup.yml
```

### Disaster Recovery

1. **Restore from backup**:
   ```bash
   kubectl apply -f config-backup.yaml
   kubectl apply -f secrets-backup.yaml
   ```

2. **Verify service health**:
   ```bash
   kubectl get pods -n nami
   curl https://ai-service.example.com/healthz
   ```

3. **Test functionality**:
   ```bash
   # Send test message to bot
   # Verify webhook processing
   # Check backend integration
   ```