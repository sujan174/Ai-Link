# Docker Deployment

Run the full AILink stack (Gateway + Dashboard + PostgreSQL + Redis) with Docker Compose.

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose installed
- At least **2 GB RAM** available for the stack
- `git` (to clone the repo)

---

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/sujan174/ailink.git
cd ailink
```

### 2. Start the Stack

```bash
docker compose up -d --build
```

> First build takes 5–10 minutes (Rust gateway compilation + Next.js dashboard build). Subsequent builds use Docker layer caching.

### 3. Access the Dashboard

Open **[http://localhost:3000](http://localhost:3000)**

- **Default Admin Key**: `ailink-admin-test` (set in `docker-compose.yml`)

---

## What's Running?

| Service | URL / Port | Description |
|---------|-----------|-------------|
| **Dashboard** | `http://localhost:3000` | Web UI for managing tokens, policies, credentials, and audit logs |
| **Gateway** | `http://localhost:8443` | The AI proxy — point your LLM clients here |
| **PostgreSQL** | `localhost:5432` | Database (User: `postgres`, Pass: `password`) |
| **Redis** | `localhost:6379` | Cache, rate limiting, spend counters, HITL queues |

### Optional Services

| Service | Command to Enable | URL |
|---------|-------------------|-----|
| **Jaeger** (Tracing) | `docker compose --profile tracing up -d` | `http://localhost:16686` |
| **Mock Upstream** (Testing) | `docker compose up mock-upstream -d` | `http://localhost:9000` |

---

## docker-compose.yml

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
    profiles: ["tracing"]
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

---

## Configuration

| Variable | What It Does | Default |
|----------|-------------|---------|
| `AILINK_MASTER_KEY` | 32-byte hex key for vault encryption. **Change for production** | dev key |
| `AILINK_ADMIN_KEY` | Root admin API key | `ailink-admin-test` |
| `DASHBOARD_SECRET` | Dashboard ↔ gateway auth secret | `ailink-dashboard-dev-secret` |
| `DASHBOARD_ORIGIN` | CORS origin for dashboard | `http://localhost:3000` |
| `AILINK_ENV` | Set to `production` for secure startup checks | `development` |
| `RUST_LOG` | Log level: `info`, `debug`, `trace` | `info` |
| `AILINK_PORT` | Gateway bind port | `8443` |
| `AILINK_SLACK_WEBHOOK_URL` | Slack webhook for HITL notifications | — |
| `AILINK_ENABLE_TEST_HOOKS` | Enable test headers. **Never in production** | `0` |

---

## Production Checklist

### Secrets

| Variable | What to do |
|----------|-----------|
| `AILINK_MASTER_KEY` | Generate a cryptographically random 32-byte hex key |
| `AILINK_ADMIN_KEY` | Set to a strong random string |
| `DASHBOARD_SECRET` | Set to a strong random string |
| `POSTGRES_PASSWORD` | Use a strong password or managed database with IAM auth |

### Infrastructure

- **PostgreSQL 16+** — RDS, Cloud SQL, Supabase, or self-hosted
- **Redis 7+** — ElastiCache, Memorystore, Upstash, or self-hosted
- **TLS** — Terminate at your load balancer (NGINX, Caddy, Traefik)
- **Secrets Management** — K8s Secrets, AWS Secrets Manager, or HashiCorp Vault

---

## Verifying the Installation

```bash
# Check all containers are healthy
docker compose ps

# Gateway health
curl http://localhost:8443/healthz

# Gateway readiness (Postgres + Redis connected)
curl http://localhost:8443/readyz
```

---

## Monitoring

### Health Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /healthz` | Liveness — 200 if process is running |
| `GET /readyz` | Readiness — 200 if Postgres and Redis are reachable |
| `GET /metrics` | Prometheus metrics (no auth required) |
| `GET /health/upstreams` | Circuit breaker health for all upstreams |

### Prometheus

Point your Prometheus scrape config at `http://ailink-gateway:8443/metrics`.

### Recommended Alerts

- Gateway readiness failing (`/readyz` returning non-200)
- Error rate > 5% (`ailink_requests_total{status=~"5.."}`)
- Latency P99 > 5s (`ailink_request_duration_seconds`)
- Circuit breaker open (`/health/upstreams` with `is_healthy: false`)

---

## Updating

```bash
git pull
docker compose up -d --build
```

## Stopping

```bash
# Stop (data preserved in Docker volumes)
docker compose down

# Stop and DELETE all data (fresh start)
docker compose down -v
```

---

## Troubleshooting

### "Connection Refused"
Ensure Docker is running. Check `docker compose ps` — all containers should show `healthy`.

### "Gateway container keeps restarting"
Check logs: `docker logs ailink-gateway-1`. Usually indicates a database connection issue.

### "Dashboard shows Network Error"
The dashboard makes browser-side requests to `NEXT_PUBLIC_API_URL` (default: `http://localhost:8443/api/v1`). Ensure:
1. Gateway container is running and healthy
2. Port 8443 is accessible from your browser
3. `DASHBOARD_ORIGIN` matches the URL you're accessing the dashboard from

### "Build takes too long"
The Rust gateway compilation is CPU-intensive. Ensure at least 2 CPU cores available to Docker.

---

## Next Steps

- **[Quickstart](../getting-started/quickstart.md)** — Create your first credential, policy, and token
- **[Kubernetes](kubernetes.md)** — Deploy on K8s
- **[Python SDK](../sdks/python.md)** / **[TypeScript SDK](../sdks/typescript.md)** — Client libraries
