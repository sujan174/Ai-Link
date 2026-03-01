# AIlink — Deployment Guide

## Docker Compose (Development & Single Server)

The simplest way to run AIlink locally or on a single VM.

### 1. docker-compose.yml

```yaml
services:
  gateway:
    build:
      context: ./gateway
      dockerfile: Dockerfile
    image: ailink/gateway:latest
    restart: unless-stopped
    ports:
      - "8443:8443"
    environment:
      - DATABASE_URL=postgres://postgres:password@postgres:5432/ailink
      - REDIS_URL=redis://redis:6379
      - RUST_LOG=info
      # ⚠️  Change these in production!
      - AILINK_MASTER_KEY=000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f
      - AILINK_ADMIN_KEY=ailink-admin-test
      - DASHBOARD_ORIGIN=http://localhost:3000
      # Enable test hooks for integration testing (X-AILink-Test-Cost header)
      # - AILINK_ENABLE_TEST_HOOKS=1
      # Slack HITL notifications
      # - AILINK_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "cat < /dev/null > /dev/tcp/localhost/8443"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    security_opt:
      - no-new-privileges:true
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: "2.0"

  dashboard:
    build:
      context: ./dashboard
      dockerfile: Dockerfile
    image: ailink/dashboard:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: "http://localhost:8443/api/v1"
      API_URL: "http://gateway:8443/api/v1"
      GATEWAY_INTERNAL_URL: "http://gateway:8443"
      AILINK_ADMIN_KEY: "ailink-admin-test"
      DASHBOARD_SECRET: "ailink-dashboard-dev-secret"
    depends_on:
      gateway:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 15s
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "1.0"

  postgres:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_DB: ailink
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password  # ⚠️  Change in production
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD-SHELL", "redis-cli ping | grep PONG"]
      interval: 10s
      timeout: 5s
      retries: 5

  jaeger:
    image: jaegertracing/all-in-one:1.50
    profiles: ["tracing"]  # Only starts with: docker compose --profile tracing up
    ports:
      - "16686:16686"  # UI
      - "4317:4317"    # OTLP gRPC
      - "4318:4318"    # OTLP HTTP
    environment:
      - COLLECTOR_OTLP_ENABLED=true

volumes:
  pgdata:
  redisdata:
```

### 2. Start
```bash
# Core stack (gateway + dashboard + postgres + redis)
docker compose up -d

# With tracing (adds Jaeger)
docker compose --profile tracing up -d
```

### 3. Verify
-   **Dashboard**: http://localhost:3000 (Admin Key: `ailink-admin-test`)
-   **Gateway**: http://localhost:8443/healthz
-   **Jaeger UI**: http://localhost:16686 (if tracing profile enabled)

---

## Production Checklist

Before deploying to production, ensure you address these items:

### Secrets

| Variable | What to do |
|---|---|
| `AILINK_MASTER_KEY` | Generate a cryptographically random 32-byte hex key. **The gateway will refuse to start in production mode if this is the default** |
| `AILINK_ADMIN_KEY` | Set to a strong random string. This is the root admin API key |
| `DASHBOARD_SECRET` | Set to a strong random string. This authenticates the dashboard proxy |
| `POSTGRES_PASSWORD` | Use a strong password (or managed database with IAM auth) |

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | required |
| `REDIS_URL` | Redis connection string | required |
| `AILINK_MASTER_KEY` | 32-byte hex key for vault encryption | required |
| `AILINK_ADMIN_KEY` | Admin API key | `ailink-admin-test` |
| `DASHBOARD_SECRET` | Dashboard proxy auth secret | required in production |
| `DASHBOARD_ORIGIN` | CORS origin for dashboard | `http://localhost:3000` |
| `AILINK_ENV` | Set to `production` to enforce secure startup checks | `development` |
| `AILINK_LOG_LEVEL` / `RUST_LOG` | `info`, `debug`, or `trace` | `info` |
| `AILINK_PORT` | Gateway bind port | `8443` |
| `AILINK_ENABLE_TEST_HOOKS` | Set to `1` for test-only headers (e.g., cost override). **Never enable in production** | `0` |
| `AILINK_SLACK_WEBHOOK_URL` | Slack webhook for HITL approval notifications | — |

### Infrastructure

- **PostgreSQL 16+** — RDS, Cloud SQL, Supabase, or self-hosted
- **Redis 7+** — ElastiCache, Memorystore, Upstash, or self-hosted
- **TLS** — Terminate TLS at your load balancer or reverse proxy (NGINX, Caddy, Traefik)
- **Secrets Management** — Kubernetes Secrets, AWS Secrets Manager, or HashiCorp Vault for `AILINK_MASTER_KEY`

### Kubernetes

Helm charts are in development. For now, deploy `ailink/gateway` as a `Deployment` + `Service`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ailink-gateway
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ailink-gateway
  template:
    spec:
      containers:
      - name: gateway
        image: ailink/gateway:latest
        ports:
        - containerPort: 8443
        envFrom:
        - secretRef:
            name: ailink-secrets
        resources:
          requests:
            memory: "256Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "2"
        livenessProbe:
          httpGet:
            path: /healthz
            port: 8443
          initialDelaySeconds: 10
        readinessProbe:
          httpGet:
            path: /readyz
            port: 8443
          initialDelaySeconds: 5
```

---

## Monitoring

### Health Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /healthz` | Liveness — 200 if process is running |
| `GET /readyz` | Readiness — 200 if Postgres and Redis are reachable |
| `GET /metrics` | Prometheus metrics (no auth required) |
| `GET /health/upstreams` | Circuit breaker health for all upstreams |

### Prometheus

Point your Prometheus scrape config at `http://ailink-gateway:8443/metrics`.

### Alerts (Recommended)

- Gateway readiness failing (`/readyz` returning non-200)
- Error rate > 5% (`ailink_requests_total{status=~"5.."}`)
- Latency P99 > 5s (`ailink_request_duration_seconds`)
- Circuit breaker open (`/health/upstreams` with `is_healthy: false`)

---

## SaaS (Managed)

Contact us for managed AIlink instances with SLAs, SSO, and dedicated support.
