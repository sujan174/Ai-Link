# AILink — Remaining Engineering Roadmap

> Ranked by competitive urgency based on live market analysis (Feb 2026).  
> **Completed items removed.** See git history for full feature history.

---
## 🟠 Priority 2 — Ship Within 2 Weeks

| # | Gap | Why Critical | Effort |
|---|-----|-------------|--------|
| **5** | **Dashboard SSO** — Okta / Google / GitHub OIDC login for dashboard | Enterprise procurement checklist item. OIDC auth is already in the gateway; apply it to the dashboard. | ~2 days |

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
