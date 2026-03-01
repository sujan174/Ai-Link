<p align="center">
  <h1 align="center">🔗 AILink</h1>
  <p align="center"><strong>The Enterprise AI Agent Gateway</strong></p>
  <p align="center">
    Route, govern, and observe every AI call — from any agent, to any model, through one secure layer.
  </p>
</p>

<p align="center">
  <a href="docs/getting-started/quickstart.md"><strong>Quickstart</strong></a> ·
  <a href="docs/reference/api.md"><strong>API Reference</strong></a> ·
  <a href="docs/sdks/python.md"><strong>Python SDK</strong></a> ·
  <a href="docs/sdks/typescript.md"><strong>TypeScript SDK</strong></a> ·
  <a href="docs/guides/policies.md"><strong>Policies</strong></a> ·
  <a href="docs/reference/architecture.md"><strong>Architecture</strong></a> ·
  <a href="docs/reference/security.md"><strong>Security</strong></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/rust-1.75+-orange?logo=rust&logoColor=white" alt="Rust">
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="License">
  <img src="https://img.shields.io/badge/tests-1%2C170%20passing-brightgreen" alt="Tests">
  <img src="https://img.shields.io/badge/latency-%3C1ms%20overhead-purple" alt="Latency">
  <img src="https://img.shields.io/badge/docker-ready-2496ED?logo=docker&logoColor=white" alt="Docker">
</p>

---

## Why AILink?

Your AI agents need API keys to do anything useful — OpenAI, Anthropic, Stripe, AWS.  
Most teams hardcode them in `.env` files with **zero governance**.

**AILink changes that.** Instead of handing agents real keys (`sk_live_...`), you issue **virtual tokens** (`ailink_v1_...`). The gateway enforces your policies, injects the real key server-side, and the agent never sees it.

```
Agent (virtual token) ──▶ AILink Gateway (policy + inject) ──▶ Provider (real key)
```

> **"You manage the Intelligence. We manage the Access."**

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🔐 Security & Access Control
- **Key Isolation** — Real keys never leave the vault
- **AES-256-GCM** envelope encryption at rest
- **OIDC / SSO** — Okta, Auth0, Entra ID with JWKS
- **RBAC** — Teams, model access groups, scoped tokens
- **Human-in-the-Loop** — Approval gates for high-stakes ops

</td>
<td width="50%">

### 🛡️ Guardrails & Safety
- **100+ safety patterns** with 22 presets
- **5 vendor integrations** — Azure, AWS, LlamaGuard, Palo Alto AIRS, Prompt Security
- **PII redaction** — SSN, email, CC, phone auto-stripped
- **PII tokenization** — Replace PII with deterministic vault tokens
- **Content filters** — Jailbreak, injection, topic deny/allow

</td>
</tr>
<tr>
<td>

### ⚙️ Policy Engine
- **15+ action types** — deny, throttle, transform, split, shadow, webhook
- **Nested AND/OR conditions** on method, path, body, headers
- **Shadow mode** — Test policies without blocking traffic
- **Async evaluation** — Non-blocking background rule checks
- **Config-as-Code** — Export/import via YAML or JSON

</td>
<td>

### 📊 Observability & Cost
- **Full audit trail** — Who, what, when, which policy, cost
- **Spend caps** — Daily / monthly / lifetime per token
- **Team budgets** — Per-team spend tracking and enforcement
- **Anomaly detection** — Sigma-based velocity spike alerts
- **Export** — Prometheus, Langfuse, DataDog, OpenTelemetry

</td>
</tr>
<tr>
<td>

### 🔄 Routing & Resilience
- **5 load-balancing strategies** — Round-robin, weighted, latency, cost, least-busy
- **Smart retries** — Exponential backoff with Retry-After
- **Circuit breakers** — Per-token failure tracking & recovery
- **Response caching** — Deterministic cache keys, skip on temp/stream
- **Model aliases** — Swap providers without changing code

</td>
<td>

### 🤖 AI-Native Features
- **Universal format translation** — OpenAI ↔ Anthropic ↔ Gemini
- **SSE streaming** — Word-by-word delta proxying
- **Tool/function calls** — Cross-provider translation
- **MCP integration** — Auto-discover & inject MCP tools
- **Multimodal** — Vision, audio transcription, embeddings

</td>
</tr>
</table>

---

## 🏗️ Architecture

```
                              ┌─────────────────────────────────────────────────────────┐
                              │                    AILink Gateway (Rust)                 │
                              │                                                         │
  Agent / SDK                 │   Token Auth ──▶ Policy Engine ──▶ Guardrails            │        Providers
 ─────────────▶               │       │              │                │                  │    ──────────────▶
  ailink_v1_...               │       ▼              ▼                ▼                  │      OpenAI
                              │   AES Vault     Transform        PII Redact              │      Anthropic
                              │       │          (headers,        (SSN, CC,              │      Gemini
                              │       ▼          body, system)     email)                │      Azure
                              │   Credential                          │                  │      Bedrock
                              │   Injection ──────────────────────────┘                  │      Cohere
                              │       │                                                  │      Ollama
                              │       ▼                                                  │
                              │   Load Balancer ──▶ Circuit Breaker ──▶ Retry            │
                              │       │                                   │              │
                              │       ▼                                   ▼              │
                              │   Audit Log + Spend Tracking + Anomaly Detection         │
                              └─────────────────────────────────────────────────────────┘
                                         │                  │                │
                                    PostgreSQL           Redis           Jaeger
```

---

## 🚀 Quickstart

### 1. Start the stack

```bash
git clone https://github.com/sujan174/ailink.git && cd ailink
docker compose up -d
```

**Dashboard** → [http://localhost:3000](http://localhost:3000) &nbsp;|&nbsp; **Gateway** → [http://localhost:8443](http://localhost:8443)

### 2. Store a credential, create a policy, issue a token

Open the dashboard and:  
1. **Vault** → Add your OpenAI / Anthropic / Gemini API key  
2. **Policies** → Create a content filter or spend cap  
3. **Virtual Keys** → Generate an `ailink_v1_...` token  

### 3. Use it — change 2 lines of code

```python
from ailink import AIlinkClient

client = AIlinkClient(
    api_key="ailink_v1_...",
    gateway_url="http://localhost:8443"
)

# Drop-in replacement for OpenAI
oai = client.openai()
resp = oai.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello from AILink!"}]
)
print(resp.choices[0].message.content)
```

**Works with any OpenAI-compatible SDK** — LangChain, CrewAI, LlamaIndex, Vercel AI SDK — just point `base_url` at AILink.

📚 **[Full Quickstart Guide →](docs/getting-started/quickstart.md)**

---

## 🆚 How AILink Compares

| Capability | AILink | Portkey | LiteLLM |
|---|:---:|:---:|:---:|
| **Language** | Rust (<1ms overhead) | TypeScript | Python |
| **Human-in-the-Loop** | ✅ | ❌ | ❌ |
| **Shadow Mode** | ✅ | ❌ | ❌ |
| **Deep Policy Engine** (15+ actions) | ✅ | Basic rules | Basic rules |
| **OIDC / JWT Native Auth** | ✅ | ❌ | ❌ |
| **PII Tokenization Vault** | ✅ | ❌ | ❌ |
| **MCP Server Integration** | ✅ | ❌ | ❌ |
| **Guardrails (100+ patterns)** | ✅ | ✅ | ❌ |
| **Teams & RBAC** | ✅ | ✅ | ✅ |
| **Load Balancing** | 5 strategies | ✅ | 5 strategies |
| **Multi-provider Translation** | ✅ | ✅ | ✅ |
| **Self-hosted** | ✅ Docker / K8s | Cloud-first | ✅ |
| **Open Source** | Apache 2.0 | MIT | MIT |

---

## 🧰 Tech Stack

| Layer | Technology |
|---|---|
| **Gateway** | Rust — Axum, Tower, Hyper, Tokio |
| **Data** | PostgreSQL 16 + Redis 7 (tiered cache) |
| **Encryption** | AES-256-GCM envelope encryption |
| **Dashboard** | Next.js 16 (App Router, Tailwind, ShadCN) |
| **SDKs** | Python & TypeScript |
| **Observability** | OpenTelemetry → Jaeger / Langfuse / DataDog / Prometheus |
| **Deployment** | Docker Compose / Kubernetes (Helm planned) |

---

## 📁 Project Structure

```
ailink/
├── gateway/                  # Rust gateway — the core
│   ├── src/
│   │   ├── middleware/       # Policy engine, guardrails, PII, audit, MCP
│   │   ├── proxy/            # Upstream proxy, retry, model router, streaming
│   │   ├── vault/            # AES-256-GCM credential storage
│   │   ├── api/              # Management REST API
│   │   └── mcp/              # MCP client, registry, types
│   └── migrations/           # SQL migrations (001–036)
├── dashboard/                # Next.js admin UI
├── sdk/python/               # Python SDK (pip install ailink)
├── sdk/typescript/           # TypeScript SDK (npm install @ailink/sdk)
├── tests/                    # All tests in one place
│   ├── unit/                 # Pure unit tests — no gateway needed
│   ├── integration/          # Live gateway + docker tests
│   ├── e2e/                  # Full-stack mock E2E (116 tests, 22 phases)
│   ├── realworld/            # Real provider API tests
│   ├── mock-upstream/        # FastAPI mock server (Dockerfile + server.py)
│   ├── conftest.py           # Shared pytest fixtures
│   └── ci_security_check.sh # CI security gate
├── docs/                     # Documentation
│   ├── getting-started/      # Quickstart & self-hosting
│   ├── sdks/                 # Python & TypeScript SDK guides
│   ├── guides/               # Policies, providers, frameworks
│   ├── reference/            # API, architecture, security
│   └── deployment/           # Docker & Kubernetes
└── docker-compose.yml
```

---

## 📖 Documentation

| Doc | Description |
|---|---|
| **[Quickstart](docs/getting-started/quickstart.md)** | Zero to running in 5 minutes |
| **[API Reference](docs/reference/api.md)** | Every endpoint, request/response format |
| **[Policy Guide](docs/guides/policies.md)** | Authoring conditions, actions, shadow mode |
| **[Python SDK](docs/sdks/python.md)** | OpenAI drop-in, LangChain / CrewAI, async, resilience |
| **[TypeScript SDK](docs/sdks/typescript.md)** | OpenAI/Anthropic drop-in, SSE streaming, typed errors |
| **[Supported Providers](docs/guides/providers.md)** | All 10 LLM providers — model prefixes, auth, feature matrix |
| **[Architecture](docs/reference/architecture.md)** | System design, caching, data flow |
| **[Security](docs/reference/security.md)** | Threat model, encryption, key lifecycle |
| **[Docker Deployment](docs/deployment/docker.md)** | Docker Compose for dev and production |
| **[Kubernetes](docs/deployment/kubernetes.md)** | K8s manifests, health probes, scaling |
| **[Framework Integrations](docs/guides/framework-integrations.md)** | LangChain, CrewAI, LlamaIndex drop-in support |

---

## 🧪 Test Suite

AILink has **1,170 tests** across three layers — no false positives, no mocks where real assertions belong.

| Layer | Tests | What's Covered |
|---|---|---|
| **Rust Unit** | 956 | Policy engine operators, PII regex, cache keys, guardrail patterns, spend caps |
| **Rust Integration** | 98 | Webhooks via wiremock, adversarial PII, RBAC, teams, load balancer routing |
| **Python E2E** | 116 | 22 phases against live Docker stack — providers, streaming, guardrails, OIDC, teams, sessions, MCP, anomaly detection |

```bash
# Run all Rust tests (unit + integration)
cargo test

# Run Python unit tests (no gateway needed)
python3 -m pytest tests/unit/ -v

# Run integration tests (requires docker compose up)
python3 -m pytest tests/integration/ -v

# Run full E2E mock suite (requires docker compose up)
python3 tests/e2e/test_mock_suite.py
```

---

## 🤝 Contributing

We welcome contributions! See **[CONTRIBUTING.md](CONTRIBUTING.md)** for dev setup and PR guidelines.

---

## 📄 License

[Apache 2.0](LICENSE) — Use it, modify it, ship it.
