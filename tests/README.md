# AILink — Test Suite

All tests live under this directory, organized by layer.

```
tests/
├── unit/                 # Pure unit tests — no gateway, no Docker
│   ├── test_unit.py      # SDK client + all resource methods (mocked)
│   └── test_features_8_10.py  # Batches & fine-tuning resources (mocked)
│
├── integration/          # Live gateway tests — requires docker compose up
│   ├── test_integration.py    # End-to-end SDK usage patterns
│   ├── test_security.py       # Auth, SSRF, RBAC, scope enforcement
│   ├── test_observability.py  # Metrics, Langfuse, Datadog export
│   ├── test_p0_fixes.py       # Rate limit enforcement, atomic spend cap
│   ├── test_phase3.py         # PII redaction, tokenization
│   ├── test_roadmap_features.py  # Framework integrations, spend tracking
│   └── run_integration.sh     # Shell runner for CI
│
├── e2e/                  # Full-stack mock E2E — 116 tests across 22 phases
│   └── test_mock_suite.py
│
├── realworld/            # Real provider tests — needs live API keys
│   └── test_realworld_suite.py
│
├── mock-upstream/        # FastAPI server that mocks OpenAI/Anthropic/Gemini
│   ├── server.py         # The mock implementation
│   ├── Dockerfile        # Built by docker-compose
│   └── requirements.txt
│
├── conftest.py           # Shared pytest fixtures (gateway_url, admin_client, etc.)
└── ci_security_check.sh  # Security gate run in CI
```

---

## Running Tests

### 1. Unit tests — no infrastructure needed

```bash
cd /path/to/ailink
python3 -m pytest tests/unit/ -v
```

### 2. Integration tests — requires a running stack

```bash
# Start the stack first
docker compose up -d

# Run integration tests
python3 -m pytest tests/integration/ -v

# Or use the shell runner (sets env vars)
bash tests/integration/run_integration.sh
```

### 3. E2E mock suite — 116 tests across 22 phases

The E2E suite uses the `mock-upstream` service (no real API keys needed).

```bash
# Start the required services
docker compose up -d gateway postgres redis mock-upstream

# Run the suite
python3 tests/e2e/test_mock_suite.py
```

### 4. Real-world suite — requires live API keys

```bash
export GEMINI_API_KEY="..."
export FIRECRAWL_API_KEY="..."
python3 tests/realworld/test_realworld_suite.py
```

### 5. Rust tests (gateway)

```bash
cd gateway
cargo test
```

---

## Test Layers

| Layer | File(s) | Gateway? | API Keys? | Speed |
|-------|---------|----------|-----------|-------|
| **Unit** | `tests/unit/` | ❌ | ❌ | ~2s |
| **Integration** | `tests/integration/` | ✅ Docker | ❌ | ~30s |
| **E2E (mock)** | `tests/e2e/` | ✅ Docker | ❌ | ~60s |
| **Real-world** | `tests/realworld/` | ✅ Docker | ✅ Required | ~5min |
| **Rust** | `gateway/` cargo test | ❌ | ❌ | ~10s |

---

## Configuration

Integration and E2E tests are configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `GATEWAY_URL` | `http://127.0.0.1:8443` | Gateway base URL |
| `ADMIN_KEY` | `ailink-admin-test` | Admin API key |
| `MOCK_UPSTREAM_URL` | `http://mock-upstream:80` | Mock upstream (Docker internal) |
| `AILINK_MOCK_URL` | `http://host.docker.internal:9000` | Mock URL the gateway uses |
| `AILINK_MOCK_LOCAL` | `http://localhost:9000` | Mock URL the test runner uses |
