# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TrueFlow is an enterprise AI agent gateway built with Rust (Axum), TypeScript (Next.js), and Python. It sits between AI agents and upstream providers, providing security, policy enforcement, observability, and cost management.

**Core Architecture**: Agent requests flow through a Tower middleware stack where policies are evaluated, credentials are injected, and responses are processed before forwarding to LLM providers.

## Development Commands

### Full Stack Development
```bash
# Start dependencies (PostgreSQL, Redis)
docker compose up -d postgres redis

# Run gateway in dev mode
cd gateway && cargo run

# Run dashboard in dev mode
cd dashboard && npm install && npm run dev
```

### Gateway (Rust)
```bash
# Build and run
cargo build --release
cargo run

# Run tests
cargo test                           # Run all tests (1,051 tests)
cargo test --test integration         # Integration tests only
cargo test --test adversarial_unit   # Unit tests only
cargo test --test full_path          # End-to-end path tests

# Run load tests (requires k6, mock upstream on 9000, and gateway on 8082)
cd gateway/tests/loadtest && ./run_all.sh

# Linting and formatting
cargo clippy                         # Check for common issues
cargo fmt                            # Format code

# Run database migrations
cargo run -- migrate
```

### Python SDK
```bash
# Install development dependencies
cd sdk/python && pip install -e ".[openai,anthropic,langchain]"

# Run Python tests
python -m pytest tests/ -v           # All Python tests
python -m pytest tests/unit/ -v      # Unit tests only

# Run full E2E test suite (requires Docker)
python3 tests/e2e/test_mock_suite.py
```

### Dashboard (TypeScript)
```bash
cd dashboard
npm install
npm run dev                          # Development server on port 3000
npm run build                        # Production build
npm run lint                         # ESLint
```

## Architecture Overview

### Component Structure

```
trueflow/
├── gateway/              # Rust gateway - core proxy and policy engine
│   ├── src/
│   │   ├── middleware/  # Tower middleware: auth, policy, guardrails, PII
│   │   ├── proxy/       # Upstream proxy: load balancer, model router, streaming
│   │   ├── api/         # Management REST API handlers
│   │   ├── store/       # PostgreSQL database layer
│   │   ├── vault/       # AES-256-GCM envelope encryption for credentials
│   │   ├── models/      # Domain models: token, policy, cost, etc.
│   │   ├── cache/       # Tiered L1/L2 caching (in-memory + Redis)
│   │   ├── jobs/        # Background tasks: cleanup, notifications
│   │   └── mcp/         # Model Context Protocol client integration
│   ├── tests/           # Integration and adversarial tests
│   └── migrations/      # SQL schema migrations (001–040+)
├── dashboard/           # Next.js admin UI (App Router, ShadCN)
├── sdk/python/          # Python client with OpenAI/Anthropic drop-in
└── sdk/typescript/      # TypeScript client
```

### Request Flow (Hot Path)

1. **TLS Termination** → 2. **Token Auth** → 3. **Policy Engine (Pre-Flight)**
   - Validates virtual tokens (`tf_v1_...`)
   - Evaluates policy conditions against request context
   - Executes actions: deny, rate limit, transform, etc.
4. **Circuit Breaker & Load Balancer** → 5. **Model Router**
   - Provider detection (OpenAI, Anthropic, Gemini, etc.)
   - Protocol translation to upstream format
6. **Credential Injection** → 7. **Upstream Request**
   - Decrypts real API keys from vault (envelope encryption)
   - Retries with exponential backoff
8. **Response Processing** → 9. **Policy Engine (Post-Flight)**
   - Redaction, audit logging, webhook dispatch

## Key Architectural Patterns

### Policy Engine
- **JSON-Logic Rules**: Policies use a DSL with conditions on dot-notation fields (`request.body.messages[0].content`)
- **Two Phases**: `pre` (before upstream) and `post` (after response)
- **Two Modes**: `enforce` (blocks/modifies) and `shadow` (logs violations only)
- **15+ Actions**: deny, rate_limit, transform, redact, webhook, tool_scope, etc.

### Credential Vault (Envelope Encryption)
- **Master Key (KEK)**: 32-byte from `TRUEFLOW_MASTER_KEY` env var (never stored)
- **Data Key (DEK)**: Unique per credential, encrypted by KEK
- **Ciphertext**: Actual API key encrypted by DEK using AES-256-GCM
- **Project Isolation**: Credentials bound to `project_id` - cross-project access blocked

### Token-Based Architecture
- **Virtual Tokens**: `tf_v1_...` pointers to configuration (upstream, policy, credentials)
- **Circuit Breaker Config**: Stored per-token in `circuit_breaker` JSONB field
- **Scopes & Roles**: RBAC with fine-grained permissions (`tokens:write`, `policies:read`, etc.)

### Streaming Architecture
- **Word-by-Word Proxying**: SSE chunks forwarded immediately to clients
- **Buffering Control**: `buffer_streaming_for_post_flight` flag enables full buffering for response-side policy enforcement
- **MCP Tool Loop**: Autonomous execution of `mcp__*` tools with up to 10 iterations

## Critical Security Considerations

### Authorization Model
- **Role-Based**: `admin`, `member`, `read_only` roles
- **Scope-Based**: Granular permissions like `approvals:write`, `model_access_groups:read`
- **404 on Mismatch**: Return 404 Not Found (not 403) for cross-project access to prevent ID enumeration

### Project Isolation
- All resources (tokens, policies, credentials) belong to a `project_id`
- API handlers must verify ownership before returning/modifying resources
- Redis keys are project-scoped: `anomaly:tok:{project_id}:{token_id}`

### SSRF Protection
- Webhook URLs validated against private IP ranges
- Cloud metadata service (169.254.169.254) blocked
- HTTPS enforced (except localhost in dev)

### Timing Attack Mitigation
- All secret comparisons use `subtle::ConstantTimeEq`
- Applies to admin keys and dashboard secrets

## Database Schema Highlights

### Core Tables
- **tokens**: Virtual identities, upstream config, policy attachment, circuit_breaker config
- **credentials**: Encrypted provider keys (envelope encrypted)
- **policies + policy_versions**: Rulesets with full version history
- **api_keys**: Management API access (RBAC roles + scopes)
- **audit_logs**: Partitioned by month, high-volume write target
- **spend_caps**: Daily/monthly/lifetime limits per token
- **model_pricing**: Dynamic cost-per-1M-token by model pattern

### Redis Usage
- **Token Cache**: `cache:token:{token_id}` - L1/L2 tiered cache with 300s TTL
- **Rate Limits**: `usage:{token_id}:requests:{window}`
- **Spend Tracking**: `spend:{token_id}:daily:{YYYY-MM-DD}`
- **Circuit Breaker States**: `cb:state:{token_id}:{url}` (distributed state)
- **Approval Streams**: `stream:approvals`, `stream:approval_responses`

## Testing Strategy

### Test Types
- **Unit Tests**: In `gateway/tests/` - focused on individual components
- **Integration Tests**: `integration.rs` - full request pipeline with mock upstreams
- **Adversarial Tests**: `adversarial_unit.rs`, `adversarial_integration.rs` - security-focused
- **E2E Tests**: Python-based, requires full Docker stack
- **Load Tests**: `tests/loadtest/` - resilience and performance testing

### Test Hooks Feature
- `--features test-hooks` enables test-only backdoor headers (`X-TrueFlow-Test-Cost`, etc.)
- NEVER enable in production builds

## Common Patterns

### Error Handling
- Use `anyhow::Result<T>` for application errors
- Custom error types in `gateway/src/errors.rs` for API responses
- Prefer explicit error handling over `.unwrap()`

### Database Queries
- Use `sqlx` with compile-time query checking
- Queries are type-safe with `query_as!`, `query_scalar!`
- All database access goes through `PgStore` in `src/store/postgres.rs`

### Middleware Development
- Implement Tower middleware traits
- Extract request context using `middleware::fields::RequestContext`
- Return blocking actions immediately; queue async actions for background execution

### Policy Action Development
- Actions defined in `src/models/policy.rs` as `Action` enum
- Execute actions in `src/middleware/engine.rs`
- New actions need both model definition and execution logic

## Dependency Notes

### Security Advisories
See `gateway/DEPENDENCIES.md` for accepted security advisories:
- RUSTSEC-2023-0071: `rsa` crate (unused MySQL TLS)
- RUSTSEC-2024-0384: `instant` crate (unmaintained but frozen)
- RUSTSEC-2025-0134: `rustls-pemfile` crate (unmaintained but frozen)

### Key Dependencies
- **axum**: Web framework with Tower middleware
- **sqlx**: Type-safe database queries
- **tokio**: Async runtime
- **reqwest**: HTTP client for upstream requests
- **redis**: Caching and distributed state
- **serde**: Serialization for policies and configs

## Environment Configuration

### Required Environment Variables
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `TRUEFLOW_MASTER_KEY`: 32-byte hex string for encryption
- `TRUEFLOW_ADMIN_KEY`: Admin API key for management operations
- `DASHBOARD_ORIGIN`: Allowed CORS origin for dashboard
- `DASHBOARD_SECRET`: Shared secret for dashboard proxy
- `TRUEFLOW_ENABLE_TEST_HOOKS`: Set to "1" in development only
- **DO NOT run tests on or kill processes on port 8080. A proxy runs on this port.** Instead, run the gateway locally on an alternative port (e.g. 8081).

### Optional Variables
- `RUST_LOG`: Logging level (info, debug, trace)
- Observability exporters: `OTEL_EXPORTER_OTLP_ENDPOINT`, `LANGFUSE_PUBLIC_KEY`, etc.

## Performance Characteristics

- **Latency Overhead**: <1ms for token resolution from cache
- **Throughput**: 1,000+ requests/second per instance (depends on policy complexity)
- **Memory**: Minimal streaming footprint using `Bytes` and streaming bodies
- **Cache**: L1 in-memory + L2 Redis with 300s TTL for hot path optimization
- **Fail-Close**: Security failures block requests; network failures trigger circuit breaking

## Integration Points

### OpenAI Compatibility
- Gateway accepts OpenAI-format requests on `/v1/*` paths
- Automatically detects provider by model name prefix
- Translates to Anthropic, Gemini, Azure, Bedrock formats as needed

### Framework Integrations
- **LangChain**: Use base_url override
- **CrewAI**: Use TrueFlow LLM wrapper
- **LlamaIndex**: Configure as custom LLM provider
- See `docs/guides/framework-integrations.md` for details

### Observability
- **Tracing**: OpenTelemetry (OTLP) export to Jaeger/Tempo
- **Metrics**: Prometheus-compatible `/metrics` endpoint
- **Logging**: Structured logging with tracing spans
- **Exporters**: Langfuse, DataDog, custom webhooks
