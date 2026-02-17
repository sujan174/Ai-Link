# AIlink — Security Model

> This document describes AIlink's security architecture, threat model, and encryption design.

---

## Core Security Principle

**Agents do not access real API keys.**

All agent credentials are virtual tokens (`ailink_v1_...`) that only work through the AIlink gateway. Real API keys are encrypted at rest, decrypted in memory only during request forwarding, and zeroed immediately after.

---

## Threat Model

### Threats & Mitigations

| # | Threat | Severity | Mitigation |
|---|---|---|---|
| T1 | **Prompt Injection → Key Exfiltration** | Critical | Agent only has virtual token. Real key never in agent's environment. `print(os.environ)` yields `ailink_v1_...`, which is useless without the gateway |
| T2 | **Stolen Virtual Token** | High | Tokens are scoped (methods, paths, rate limits). Instantly revocable. IP allowlisting available. Short TTLs optional |
| T3 | **Replay Attack** | Medium | Idempotency keys, request timestamping, rate limiting |
| T4 | **Man-in-the-Middle** | High | TLS 1.3 enforced on all connections. mTLS available for enterprise |
| T5 | **Runaway Agent Costs** | High | Per-token spend caps. Per-window rate limits. HITL for high-value operations |
| T6 | **Accidental Destructive Operations** | High | Method + path whitelists (e.g., GET only). HITL for write operations. Shadow mode for safe rollout |
| T7 | **Gateway Infrastructure Compromise** | Critical | Secrets encrypted at rest (AES-256-GCM). DEKs held in memory only during request. Master key in environment variable or external KMS, never in database |
| T8 | **Insider Threat (AIlink Operator)** | High | Envelope encryption — operators can access encrypted blobs but not plaintext. Master keys in HSM/KMS for enterprise |
| T9 | **Stale Compromised Credentials** | Medium | Automatic key rotation — real API keys rotated every 24h. A stolen key expires in hours |
| T10 | **Supply Chain Attack (SDK)** | Medium | SDKs published with SLSA provenance. Dependencies pinned and audited |
| T11 | **Database Breach** | High | All credentials encrypted at rest. Audit logs contain request hashes, not request bodies. PII redacted before storage |

---

## Encryption Design

### Envelope Encryption

AIlink implements envelope encryption, following the pattern used by AWS KMS and HashiCorp Vault.

```
┌─────────────────────────────────────────────────────────┐
│ Master Key (KEK)                                        │
│ Source: Environment variable or external KMS             │
│ Never stored in database                                │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Data Encryption Key (DEK)                          │  │
│  │ Unique per credential                              │  │
│  │ Stored encrypted (by KEK) in PostgreSQL            │  │
│  │                                                    │  │
│  │  ┌─────────────────────────────────────────────┐   │  │
│  │  │ Credential (e.g., sk_live_...)               │   │  │
│  │  │ Encrypted by DEK using AES-256-GCM           │   │  │
│  │  │ Stored as: nonce (12B) + ciphertext + tag     │   │  │
│  │  └─────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Key Properties

| Property | Value |
|---|---|
| Algorithm | AES-256-GCM (authenticated encryption) |
| Nonce | 96-bit, unique per encryption operation, **never reused** |
| DEK | 256-bit, unique per credential |
| KEK (Master Key) | Derived from env var (`AILINK_MASTER_KEY`) or external KMS |

### Key Rotation

- **Master Key Rotation**: Decrypt all DEKs with old master, re-encrypt with new master. Credentials themselves are untouched.
- **DEK Rotation**: Generate new DEK, decrypt credential with old DEK, re-encrypt with new DEK.
- **Credential Rotation**: AIlink's auto-rotation feature creates a new key on the provider API (e.g., Stripe), encrypts it with a new DEK, and revokes the old key after a grace period.

---

## Data Security

### What AIlink Stores

| Data | Storage | Encryption |
|---|---|---|
| Real API keys | PostgreSQL | AES-256-GCM (envelope encrypted) |
| Virtual tokens | PostgreSQL | Plaintext (they are not secrets — useless without the gateway) |
| Policies | PostgreSQL | Plaintext (not sensitive) |
| Audit logs | PostgreSQL (partitioned) | Plaintext metadata. Bodies stored only at Level 1+ (PII-scrubbed) or Level 2 (full debug, auto-expires after 24h) |

### What AIlink Does NOT Store (at Level 0)

- Request/response bodies (only metadata: method, path, status, latency, cost)
- Real API keys in plaintext anywhere

### Privacy-Gated Body Capture (Phase 4)

| Log Level | Bodies | Headers | PII | Auto-Expiry |
|---|---|---|---|---|
| **0** (default) | ❌ Not stored | ❌ Not stored | N/A | — |
| **1** (scrubbed) | ✅ PII-redacted | ❌ Not stored | SSN, email, CC, phone, API keys scrubbed | — |
| **2** (full debug) | ✅ Raw bodies | ✅ Full headers | No redaction | **24 hours** (auto-downgraded to Level 0) |

### Data Retention

- Audit logs: 90-day retention (configurable). Old monthly partitions are dropped automatically.
- Level 2 debug bodies: Auto-expired by background cleanup job (runs hourly).
- Credentials: Retained until explicitly deleted. Old rotated versions deleted after grace period.

---

## Network Security

| Layer | Protection |
|---|---|
| Agent → Gateway | TLS 1.3 (enforced). mTLS optional for enterprise |
| Gateway → Upstream | TLS (uses upstream API's certificate) |
| Gateway → PostgreSQL | TLS or Unix socket |
| Gateway → Redis | TLS or private network |

### IP Allowlisting

Tokens can optionally specify allowed source IPs:

```json
{
  "when": { "field": "source_ip", "op": "not_in", "value": ["10.0.0.0/8", "192.168.1.100/32"] },
  "then": { "action": "deny" }
}
```

---

## Runtime Security

### Secret Lifecycle in Memory

1. Agent request arrives
2. Gateway decrypts DEK with master key (in memory)
3. Gateway decrypts credential with DEK (in memory)
4. Credential injected into upstream request header
5. Upstream request sent
6. **Credential zeroed from memory immediately after injection**

The real credential exists in memory for the shortest possible time — typically microseconds.

### Process Isolation

- The gateway runs as a non-root user in Docker
- No shell access from the gateway process
- Secrets are never logged (structured logging excludes credential values)
- Environment variables with secrets are not exposed to child processes

---

## Compliance Roadmap

| Certification | Target |
|---|---|
| SOC 2 Type II | Year 1 |
| GDPR | Year 1 (data residency options) |
| HIPAA | Year 2 (for healthcare AI agents) |
