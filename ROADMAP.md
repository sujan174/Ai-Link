# AILink — Remaining Engineering Roadmap

> Ranked by competitive urgency based on live market analysis (Feb 2026).  
> **Completed items removed.** See git history for full feature history.

---

## 🔴 Priority 1 — Ship Now *(highest competitive impact)*

| # | Gap | Why Critical | Effort |
|---|-----|-------------|--------|
| **1** | **TypeScript SDK** (`@ailink/sdk`) — parity with Python SDK (HITL, trace, fallback, `openai()` wrapper) | ~50% of AI devs use TypeScript. Portkey, LiteLLM, Helicone, TensorZero, Bifrost all have TS SDKs. AILink is invisible to this audience. | ~1 week |
| **2** | **MCP Auto-Discovery + OAuth 2.0 token refresh** — when a URL is provided, auto-`initialize` + `list_tools`; store `client_id/secret/token_endpoint`, refresh token when expired | Bifrost has auto-discovery + OAuth 2.0. LiteLLM added native MCP (Nov 2025). Kong ships MCP OAuth2 plugin. Our manual-registration-only approach is falling behind fast. Architecture is ready (`client.rs` + `registry.rs` + `SecretStore` trait). | ~1 week |
| **3** | **Provider Breadth** — Azure OpenAI, Bedrock, Groq, Mistral, Together, Cohere, Ollama | Enterprise will reject in the first 5 min if their provider isn't supported. | ~2 days/provider |
| **4** | **Free Tier + Self-Serve Onboarding** — hosted free tier (10K req/mo, 7-day logs) + "Start for free" CTA | Every competitor has a free tier. Without one, zero developer evangelism or bottom-up adoption pipeline. | ~3 days |

---

## 🟠 Priority 2 — Ship Within 2 Weeks

| # | Gap | Why Critical | Effort |
|---|-----|-------------|--------|
| **5** | **Dashboard SSO** — Okta / Google / GitHub OIDC login for dashboard | Enterprise procurement checklist item. OIDC auth is already in the gateway; apply it to the dashboard. | ~2 days |
| **6** | **MCP Per-Token Tool Allow/Deny Lists** — policy-engine field restricting which MCP tools a token can invoke | Bifrost has per-key tool filtering + global tool blacklisting. Needed for security-conscious enterprise MCP usage. | ~1 day |
| **7** | **Open-Source the Gateway Binary** — publish `gateway/` on GitHub under Apache 2.0 | Bottom-up developer trust and adoption. LiteLLM's entire community moat comes from being OSS. | ~2 days (legal review + README) |

---

## 🟡 Priority 3 — Ship Within Month 1

| # | Gap | Why Critical | Effort |
|---|-----|-------------|--------|
| **8** | **KMS Integration** — AWS KMS + HashiCorp Vault backends for `SecretStore` trait | Enterprise: "Can I use my own KMS?" `vault/mod.rs` trait is already defined — just implement new backends. Won't close sales before SOC-2, but needed for the pipeline after SOC-2. | ~1.5 weeks |
| **9** | **NLP-Backed PII Redaction** — optional Presidio/spaCy sidecar as `PiiDetector` backend | Kong's Apr 2025 plugin covers 20+ categories in 12 languages via NLP. Our regex covers English-primary well enough for now. Revisit when a multilingual customer asks for it. | ~2–3 weeks |
| **10** | **Dashboard Polish** — onboarding flow, empty states, animations | Portkey's UI is cited as the category reference. Buyer demos are won on UX. | ~3–5 days |
| **11** | **Cache Streaming** — stream cached responses chunk-by-chunk instead of returning full blob | Portkey does this; small UX improvement for cached responses. | ~0.5 day |
| **12** | **Prompt Management** — versioning, playground, A/B testing UI | Portkey's prompt playground is a user magnet. Large surface area. | ~4 days |

---

## ⚪ Priority 4 — Ship Within Quarter 1 *(requires external process/spend)*

| # | Gap | Why Critical | Effort |
|---|-----|-------------|--------|
| **13** | **SOC-2 Type I → Type II** — start with Drata/Vanta to automate controls | Hard procurement blocker for any regulated enterprise deal above ~$50K/yr. Portkey + Kong already certified. | Process: ~3–6 months, ~$15–30K |
| **14** | **Compliance Certifications** — ISO 27001, HIPAA, GDPR readiness | Downstream from SOC-2. LiteLLM + Kong have both. | After SOC-2 |

---

## 🏆 Unique Advantages to Protect & Extend

These are areas where AILink leads every competitor. Keep shipping on them:

- **HITL approval gateway** — native 202/poll pattern; no one else has this as a gateway primitive
- **Shadow mode** — unique in the category; extend it into "policy simulation" (replay historical traffic)
- **PII tokenization vault** — deterministic reversible tokens; no competitor has this
- **Deep policy engine** — 15+ action types; extend with more condition operators
- **Anomaly detection** — extend with configurable thresholds per-token

---

*Last updated: Feb 2026*
