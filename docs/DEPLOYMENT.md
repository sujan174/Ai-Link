# AIlink — Deployment Guide

## Docker Compose

The simplest way to run AIlink locally or on a single VM.

### 1. docker-compose.yml

```yaml
version: "3.8"

services:
  gateway:
    image: ailink/gateway:latest
    ports:
      - "8443:8443"
    environment:
      # Database
      DATABASE_URL: postgres://postgres:password@postgres:5432/ailink
      
      # Redis
      REDIS_URL: redis://redis:6379
      
      # Master Key (for vault encryption)
      AILINK_MASTER_KEY: "change_this_to_a_secure_random_key_32_bytes"
      
      # Slack Integration (for HITL)
      # AILINK_SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/..."
      
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  dashboard:
    image: ailink/dashboard:latest
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: "http://localhost:8443/api/v1"
      API_URL: "http://gateway:8443/api/v1"
    depends_on:
      - gateway

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: ailink
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD-SHELL", "redis-cli ping | grep PONG"]
      interval: 10s
      timeout: 5s
      retries: 5

  jaeger:
    image: jaegertracing/all-in-one:1.50
    ports:
      - "16686:16686" # UI
      - "4317:4317" # OTLP gRPC

volumes:
  pgdata:
  redisdata:
```

### 2. Start
```bash
docker compose up -d
```

### 3. Verify
-   **Dashboard**: http://localhost:3000
-   **Gateway**: http://localhost:8443/healthz
-   **Jaeger UI**: http://localhost:16686

---

## Production (Kubernetes)

Helm charts available in Phase 2. For now, deploy `ailink/gateway` as a Deployment + Service.

### Requirements

- **PostgreSQL 16+** (RDS, Cloud SQL, or self-hosted)
- **Redis 7+** (ElastiCache, Memorystore, or self-hosted)
- **Secrets Management** (Kubernetes Secrets or external Vault)

### Configuration

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection string |
| `AILINK_MASTER_KEY` | 32-byte hex key for vault encryption (Critical: Change in production!) |
| `AILINK_ADMIN_KEY` | Admin API key (default: `ailink-admin-test`) |
| `AILINK_LOG_LEVEL` | `info`, `debug`, or `trace` (default: `info`) |
| `AILINK_PORT` | Port to bind (default: 8443) |
| `AILINK_ENABLE_TEST_HOOKS`| Set to `1` to enable test-only headers (e.g., cost override). Off by default |

---

## SaaS (Managed)

Contact us for managed AIlink instances with SLAs, SSO, and dedicated support.
