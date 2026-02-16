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
      SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/..."
      
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: ailink
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
```

### 2. Start
```bash
docker compose up -d
```

### 3. Verify
```bash
curl http://localhost:8443/healthz
# 200 OK
```

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
| `AILINK_MASTER_KEY` | 32-byte hex key for encrypting vault credentials |
| `AILINK_LOG_LEVEL` | `info`, `debug`, or `trace` |
| `AILINK_PORT` | Port to bind (default: 8443) |

---

## SaaS (Managed)

Contact sales for managed AIlink instances with SLAs, SSO, and dedicated support.
