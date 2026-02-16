<p align="center">
  <h1 align="center">🔗 AIlink</h1>
  <p align="center"><strong>The Secure Connectivity Layer for AI Agents</strong></p>
  <p align="center"><em>"You manage the Intelligence. We manage the Access."</em></p>
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> •
  <a href="docs/VISION.md">Product Vision</a> •
  <a href="docs/ARCHITECTURE.md">Architecture</a> •
  <a href="docs/SDK.md">SDK Guide</a> •
  <a href="docs/API.md">API Reference</a> •
  <a href="docs/SECURITY.md">Security</a> •
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

---

## The Problem

Every AI Agent needs API keys to be useful (Stripe, GitHub, AWS, Slack, OpenAI). Today, developers often store these keys in plaintext `.env` files, hardcoded variables, or scattered across local environments without oversight.

### The Risks

| Risk | Impact |
|---|---|
| 🔓 **Prompt Injection** | Attackers trick agents into revealing environment variables (`os.environ`) |
| 💸 **Runaway Costs** | Agents enter infinite loops, draining API budgets |
| 💥 **Accidental Damage** | Agents with broad permissions delete or corrupt production data |
| 🕵️ **Zero Visibility** | No audit trail of agent activity or data access |

## The Solution

**AIlink is a Secure API Gateway** for AI Agents.

Instead of giving agents **real keys** (`sk_live_...`), you issue **virtual tokens** (`ailink_v1_...`). The agent sends requests to AIlink, which enforces policies and injects the real key before forwarding to the upstream API. **The agent never possesses the real credential.**

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│    AI Agent      │──────▶│   AIlink Gateway │──────▶│   Stripe / AWS   │
│  (ailink_token)  │       │ (Policy + Inject)│       │    (real key)    │
└──────────────────┘       └──────────────────┘       └──────────────────┘
```

### Key Features

| Feature | Benefit |
|---|---|
| 🔐 **Key Isolation** | Real keys never leave the vault; agents cannot leak what they don't have |
| 📋 **Policy Engine** | Granular control over methods, paths, and rates per agent |
| 👤 **Human-in-the-Loop** | Pause high-stakes operations for manual approval via Slack |
| 👻 **Shadow Mode** | Test policies safely by logging violations without blocking requests |
| 🔄 **Auto-Rotation** | Automatically rotate provider keys every 24h |
| 🛡️ **PII Sanitization** | Automatically redact sensitive data (CC, SSN, Keys) from responses |
| 📊 **Audit Trail** | Complete log of every request, including shadow violations and redacted fields |
| 📈 **Analytics** | Built-in dashboards for request volume, latency, and error rates |
| ⚡ **Performance** | Rust-powered gateway with <1ms overhead via tiered caching |

---

## Quickstart

### 1. Start AIlink (Gateway + Dashboard)

```bash
git clone https://github.com/your-org/ailink.git
cd ailink
docker compose up -d
```

This starts the entire stack:
*   **Dashboard**: [http://localhost:3000](http://localhost:3000) (Login: `ailink-admin-test`)
*   **Gateway**: [http://localhost:8443](http://localhost:8443)

👉 **See [Self-Hosting Guide](docs/self-hosting.md) for full setup details.**


### 2. Add Your API Key

```bash
# Store your real Stripe key in the AIlink vault
docker exec ailink-gateway ailink credential add \
  --name "stripe-production" \
  --key "sk_live_your_real_stripe_key"

# Create a virtual token for your agent
docker exec ailink-gateway ailink token create \
  --name "billing-agent-stripe" \
  --credential "stripe-production" \
  --upstream "https://api.stripe.com" \
  --methods GET,POST \
  --paths "/v1/charges/*,/v1/customers/*" \
  --rate-limit "60/min"
# Output: ailink_v1_proj_default_tok_abc123
```

### 3. Use in Your Agent

```python
pip install ailink
```

```python
import stripe
from ailink import AIlinkClient

# Initialize the client
client = AIlinkClient(
    api_key="ailink_v1_proj_default_tok_abc123",
    gateway_url="http://localhost:8443"
)

# Use provider-specific helpers (OpenAI/Anthropic) or raw requests
# Example: Using standard Stripe library with AILink as the base URL
stripe.api_base = "http://localhost:8443"
stripe.api_key = "ailink_v1_proj_default_tok_abc123"

charges = stripe.Charge.list()  # ✅ Proxied, secured, logged
```

That's it. Your agent never has the real Stripe key, can't exceed 60 requests/minute, and can only access `/v1/charges` and `/v1/customers`.

---

## How It Works

```
Agent Request (ailink_token)
       │
       ▼
┌─────────────────────────────────────────────┐
│              AIlink Gateway                  │
│                                             │
│  1. Resolve token → credential + policies   │
│  2. Check cache (in-memory → Redis → PG)    │
│  3. Evaluate policies:                      │
│     • Method + Path allowed?                │
│     • Rate limit OK?                        │
│     • Spend cap OK?                         │
│     • Human approval needed?                │
│  4. Decrypt real API key from vault         │
│  5. Inject key → forward to upstream API    │
│  6. Sanitize response (redact sensitive)    │
│  7. Log to audit trail                      │
└─────────────────────────────────────────────┘
       │
       ▼
Upstream API (real key, never exposed)
```

---

## Documentation

| Document | Description |
|---|---|
| [Product Vision](docs/VISION.md) | Why AIlink exists, who it's for, and where it's going |
| [Architecture](docs/ARCHITECTURE.md) | System design, components, data flow, technology choices |
| [Security Model](docs/SECURITY.md) | Threat model, encryption design, key management |
| [SDK Guide](docs/SDK.md) | Python & TypeScript SDK usage, LangChain/CrewAI integration |
| [API Reference](docs/API.md) | Gateway proxy API & management API endpoints |
| [Policy Guide](docs/POLICIES.md) | How to author policies — methods, paths, rate limits, HITL, shadow mode |
| [Deployment Guide](docs/DEPLOYMENT.md) | Docker Compose, Kubernetes, SaaS |
| [Contributing](CONTRIBUTING.md) | How to set up the development environment and contribute |

---

## Tech Stack

| Component | Technology |
|---|---|
| Gateway | **Rust** (Axum, Tower, Hyper, Tokio) |
| Data Store | **PostgreSQL 16** + **Redis 7** |
| Encryption | **AES-256-GCM** (envelope encryption) |
| SDKs | **Python**, **TypeScript** |
| Dashboard | **Next.js** + **tRPC** (Phase 2) |
| Observability | **OpenTelemetry** → Grafana |
| Distribution | **Docker** / **Helm** |

---

## Project Structure

```
ailink/
├── gateway/                # Rust gateway (the core product)
│   ├── Cargo.toml
│   ├── Dockerfile
│   └── src/
│       ├── main.rs
│       ├── config.rs
│       ├── cache.rs
│       ├── cli.rs
│       ├── errors.rs
│       ├── rotation.rs
│       ├── middleware/     # Request/response pipeline
│       ├── proxy/          # Upstream HTTP proxy
│       ├── vault/          # Secret storage backends
│       ├── store/          # Data store backends
│       └── models/         # Shared data types
├── sdk/
│   └── python/             # Python SDK (pip install ailink)
├── dashboard/              # Next.js admin UI
│   └── Dockerfile
├── examples/               # Demo scripts
├── docs/                   # Documentation
├── docker-compose.yml
└── README.md
```

---

## License

[Apache 2.0](LICENSE)
