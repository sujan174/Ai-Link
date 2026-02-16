# AIlink — Technical Architecture

> For the product overview, see [VISION.md](VISION.md). This document covers the technical design.

---

## System Overview

AIlink is a Rust-based reverse proxy that intercepts HTTP requests, enforces policies, injects credentials, and forwards requests to upstream APIs. Agents do not access real API keys.

### Request Lifecycle

```
Agent → TLS → Cache Lookup → Auth → Policy Engine → [HITL] → Key Inject → Upstream Proxy → Sanitize → Audit → Agent
```

Every request flows through this pipeline. Each stage is a composable Tower middleware layer in Axum.

```
┌──────────────────────────────────────────────────────────────────┐
│                       REQUEST PIPELINE                           │
├─────────┬──────────┬──────────┬──────────┬──────────┬───────────┤
│  TLS    │  Cache   │  Auth &  │  Policy  │  Key     │ Upstream  │
│  Term   │  Lookup  │  Token   │  Engine  │  Inject  │ Proxy     │
│         │          │  Resolve │  [+HITL] │          │           │
├─────────┴──────────┴──────────┴──────────┴──────────┴───────────┤
│                       RESPONSE PIPELINE                          │
├─────────┬──────────┬──────────┬──────────────────────────────────┤
│ Receive │ Sanitize │  Audit   │ Return to Agent                 │
│         │ (stream) │  (async) │                                 │
└─────────┴──────────┴──────────┴──────────────────────────────────┘
```

---

## Technology Choices

| Component | Choice | Rationale |
|---|---|---|
| **Language** | Rust | Memory safety and consistent latency (no GC). |
| **Web Framework** | Axum (+ Towers) | Composable middleware and async I/O. |
| **Primary DB** | PostgreSQL 16 | ACID compliance and JSONB support for policies. |
| **Cache / Queue** | Redis 7 | In-memory caching and streams for HITL. |
| **Encryption** | AES-256-GCM | Authenticated envelope encryption. |
| **Observability** | OpenTelemetry | Vendor-neutral tracing and metrics. |

---

## Component Architecture

### 1. Tiered Caching

The gateway resolves token → credential + policies on every request. Without caching, this hits PostgreSQL twice per request (~5–10ms). The tiered cache eliminates this:

| Tier | Store | Latency | TTL | Invalidation |
|---|---|---|---|---|
| **1** | In-memory (DashMap) | <0.01ms | 30s | Redis pub/sub event |
| **2** | Redis | <1ms | 5min | On token/policy update |
| **3** | PostgreSQL | ~5ms | — | Source of truth |

**Invalidation flow:** Management API updates PG → deletes Redis key → publishes to `ailink:cache:invalidate` channel → all gateway instances evict from DashMap.

### 2. Virtual Token System

Tokens are the primary identity mechanism for agents. Each token maps to:
- An upstream URL (e.g., `https://api.stripe.com`)
- An encrypted credential in the vault
- A set of policies (method whitelists, rate limits, etc.)

Token format: `ailink_v1_proj_{project_id}_tok_{token_id}`

### 3. Policy Engine

Policies are declarative YAML/JSON documents evaluated in a fixed order:

1. Token Validity → 2. IP Allowlist → 3. Time Window → 4. Method + Path → 5. Rate Limit → 6. Spend Cap → 7. HITL → 8. Pass

Each rule is an independent evaluator. First `deny` short-circuits. HITL causes a `pause`. In `shadow` mode, denials are logged but not enforced.

### 4. HITL Approval (Redis Streams)

When a policy triggers HITL:
1. Gateway publishes to `stream:approvals` in Redis
2. A Slack webhook notifies the reviewer with approve/reject buttons
3. The reviewer's action is published to `stream:approval_responses`
4. Gateway resumes or cancels the request

Idempotency keys prevent duplicate approvals when agents retry during the wait.

### 5. Vault Abstraction

A `SecretStore` trait with three backends:

| Backend | Use Case |
|---|---|
| `BuiltinStore` | Envelope encryption in PostgreSQL (AES-256-GCM, per-secret DEKs) |
| `VaultStore` | HashiCorp Vault transit engine (Phase 2+) |
| `KmsStore` | AWS KMS + Secrets Manager (Phase 2+) |

Envelope encryption: Master Key (env/file) → encrypts Data Encryption Keys (DEKs) → DEKs encrypt individual secrets. Each encryption uses a unique 96-bit nonce.

### 6. Response Sanitization

Streaming-aware sanitization to avoid buffering large responses:

| Condition | Strategy |
|---|---|
| JSON < 1MB | Full parse + JSONPath redaction + regex scan |
| JSON 1–10MB | Streaming tokenizer with sliding window |
| JSON > 10MB | Pass-through (headers only) |
| SSE streams | Per-event scan |
| Binary | Pass-through |

### 7. Audit Logging

All requests are logged to a PostgreSQL partitioned table (monthly partitions, 90-day retention). Logged fields include: identity, request details, policy decisions (including shadow mode results), HITL outcomes, response metadata, cost estimates, and OpenTelemetry trace/span IDs.

Migration path: When audit volume exceeds ~50GB/month, migrate to ClickHouse with a compatible schema.

---

## Data Flow Diagram

```
┌──────────┐    ailink_token     ┌──────────────┐     real_key      ┌──────────┐
│          │ ─────────────────▶ │              │ ─────────────────▶ │          │
│ AI Agent │                    │    AIlink    │                    │ Upstream │
│          │ ◀───────────────── │   Gateway    │ ◀───────────────── │   API    │
└──────────┘   clean response   │              │    raw response    └──────────┘
                                └──────┬───────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
              ┌─────▼─────┐    ┌──────▼──────┐    ┌──────▼──────┐
              │ PostgreSQL │    │    Redis    │    │    Vault    │
              │ • Tokens   │    │ • Cache    │    │ • Secrets  │
              │ • Policies │    │ • Rates    │    │ • DEKs     │
              │ • Audit    │    │ • HITL     │    │            │
              │ • Users    │    │ • Pub/Sub  │    │            │
              └────────────┘    └────────────┘    └────────────┘
```

---

## Crate Structure

```
gateway/src/
├── main.rs              # Axum bootstrap, middleware stack composition
├── config.rs            # Env vars + optional TOML config
├── cache.rs             # DashMap + Redis two-tier cache
├── cli.rs               # CLI commands (token, credential, policy management)
├── errors.rs            # Unified error types and HTTP error responses
├── rotation.rs          # Automatic key rotation scheduler
│
├── middleware/
│   ├── auth.rs           # Token extraction and validation
│   ├── policy.rs         # Policy evaluation engine
│   ├── shadow.rs         # Shadow mode logging
│   ├── rate_limit.rs     # Redis-backed sliding window rate limiter
│   ├── hitl.rs           # HITL pause/resume via Redis Streams
│   ├── idempotency.rs    # Idempotency key deduplication for HITL
│   ├── key_inject.rs     # Vault decrypt + header injection
│   ├── sanitize.rs       # Streaming-aware response sanitization
│   └── audit.rs          # Async audit log writer
│
├── proxy/
│   ├── upstream.rs       # Hyper client with connection pooling
│   └── transform.rs      # URL rewriting, header mutation
│
├── vault/
│   ├── mod.rs            # SecretStore trait definition
│   ├── builtin.rs        # AES-256-GCM envelope encryption (PG-backed)
│   ├── hashicorp.rs      # HashiCorp Vault backend
│   └── aws_kms.rs        # AWS KMS backend
│
├── store/
│   ├── mod.rs            # DataStore trait definition
│   └── postgres.rs       # PostgreSQL implementation (sqlx)
│
└── models/
    ├── token.rs           # Token types and serialization
    ├── policy.rs          # Policy rules and evaluation types
    └── audit.rs           # Audit log entry schema
```

---

## Key Design Principles

1. **Zero-trust by default** — No request passes without token validation and policy evaluation
2. **Cache-first hot path** — In-memory → Redis → PG. Hot requests never hit the database
3. **Streaming, not buffering** — The proxy streams request and response bodies; never buffers more than necessary
4. **Composable middleware** — Each security feature is an independent Tower Layer that can be tested, enabled, or disabled independently
5. **Graceful degradation** — If Redis is down, fall back to PG. If audit writes lag, don't block the request (async writes)
6. **Observable by default** — Every request produces an OpenTelemetry span with a trace ID that flows through audit logs
