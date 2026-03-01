# AILink TypeScript SDK

> Zero-dependency TypeScript client for the AILink Gateway — OpenAI/Anthropic drop-in, SSE streaming, typed errors.

```bash
npm install @ailink/sdk
```

---

## Quick Start — OpenAI Drop-In

```typescript
import { AILinkClient } from '@ailink/sdk';

const client = new AILinkClient({
  apiKey: 'ailink_v1_...',
  gatewayUrl: 'https://gateway.ailink.dev',
});

// Get a configured OpenAI client — works with openai@4+
const openai = client.openai();

const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello from TypeScript!' }],
});
console.log(response.choices[0].message.content);
```

---

## Streaming

```typescript
const stream = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Write a haiku' }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? '');
}
```

---

## Anthropic Drop-In

```typescript
const anthropic = client.anthropic();
const message = await anthropic.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello Claude via AILink!' }],
});
```

---

## Action Gateway (API Proxy)

```typescript
const client = new AILinkClient({
  apiKey: 'ailink_v1_proj_abc123_tok_def456',
  gatewayUrl: 'https://gateway.ailink.dev',
  agentName: 'billing-agent',
});

// GET request
const customers = await client.get('/v1/customers');

// POST request
const charge = await client.post('/v1/charges', {
  body: { amount: 5000, currency: 'usd' },
});

// With HITL approval
const result = await client.post('/v1/charges', {
  body: { amount: 50000, currency: 'usd' },
  waitForApproval: true,
  approvalTimeout: 300,
  idempotencyKey: 'charge-order-12345',
});
```

---

## Admin Mode (Management API)

```typescript
const admin = AILinkClient.admin({
  adminKey: 'ailink-admin-test',
  gatewayUrl: 'http://localhost:8443',
});

// ── Tokens ──
const tokens = await admin.tokens.list();
const newToken = await admin.tokens.create({
  name: 'prod-agent',
  credentialId: 'cred-uuid',
  upstreamUrl: 'https://api.openai.com',
  circuitBreaker: { enabled: true, failureThreshold: 5 },
});
await admin.tokens.delete(newToken.tokenId);

// ── Credentials ──
const creds = await admin.credentials.list();
const newCred = await admin.credentials.create({
  name: 'openai-prod',
  provider: 'openai',
  secret: 'sk-...',
  injectionMode: 'header',
  injectionHeader: 'Authorization',
});

// ── Policies ──
const policies = await admin.policies.list();
const policy = await admin.policies.create({
  name: 'rate-limit-60rpm',
  mode: 'enforce',
  rules: [
    { when: { always: true }, then: { action: 'rate_limit', window: '1m', max_requests: 60 } },
  ],
});

// ── Guardrails ──
await admin.guardrails.enable('ailink_v1_...', ['pii_redaction', 'prompt_injection']);
const status = await admin.guardrails.status('ailink_v1_...');
await admin.guardrails.disable('ailink_v1_...');

// ── Analytics ──
const summary = await admin.analytics.summary();
const timeseries = await admin.analytics.timeseries();

// ── Config-as-Code ──
const yamlConfig = await admin.config.export();
await admin.config.importYaml(yamlConfig);
```

---

## Health Polling & Fallback

```typescript
import { AILinkClient, HealthPoller } from '@ailink/sdk';
import OpenAI from 'openai';

const client = new AILinkClient({ apiKey: 'ailink_v1_...' });
const fallback = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// One-shot health check
if (await client.isHealthy()) {
  const openai = client.openai();
} else {
  // use fallback
}

// Background polling (long-running services)
const poller = new HealthPoller(client, { interval: 15 });
poller.start();

const openai = poller.isHealthy ? client.openai() : fallback;
poller.stop();
```

---

## Per-Request Guardrails

```typescript
import { PRESET_PII_REDACTION, PRESET_PROMPT_INJECTION } from '@ailink/sdk';

const guarded = client.withGuardrails([PRESET_PII_REDACTION, PRESET_PROMPT_INJECTION]);
await guarded.post('/v1/chat/completions', { ... });
```

---

## BYOK (Bring Your Own Key)

```typescript
const byok = client.withUpstreamKey('sk-my-openai-key');
await byok.post('/v1/chat/completions', { model: 'gpt-4o', messages: [...] });
```

---

## Session Tracing

```typescript
const traced = client.trace({
  sessionId: 'agent-run-42',
  properties: { env: 'prod', customer: 'acme' },
});

await traced.post('/v1/chat/completions', { model: 'gpt-4o', messages: [...] });
```

---

## Error Handling

Every gateway failure maps to a typed error:

```typescript
import {
  AILinkError,
  PolicyDeniedError,
  RateLimitError,
  SpendCapError,
  ContentBlockedError,
  AuthenticationError,
} from '@ailink/sdk';

try {
  const response = await client.post('/v1/charges', { body: { amount: 5000 } });
} catch (error) {
  if (error instanceof PolicyDeniedError) {
    console.error(`Blocked: ${error.policyName} — ${error.reason}`);
  } else if (error instanceof RateLimitError) {
    console.error(`Rate limited — retry after ${error.retryAfter}s`);
  } else if (error instanceof SpendCapError) {
    console.error('Spend cap exceeded');
  } else if (error instanceof ContentBlockedError) {
    console.error('Content blocked by guardrail');
  }
}
```

### Error Hierarchy

```
AILinkError (base)
├── AuthenticationError      (401)
├── AccessDeniedError        (403)
│   ├── PolicyDeniedError    (403, code=policy_denied)
│   └── ContentBlockedError  (403, code=content_blocked)
├── NotFoundError            (404)
├── RateLimitError           (429, retryAfter)
├── ValidationError          (422)
├── PayloadTooLargeError     (413)
├── SpendCapError            (402)
└── GatewayError             (5xx)
```

---

## Realtime API (WebSocket)

```typescript
const session = await client.realtime.connect('gpt-4o-realtime-preview');
await session.send({ type: 'session.update', /* ... */ });
const event = await session.recv();
await session.close();
```

---

## SSE Streaming

```typescript
import { streamSSE } from '@ailink/sdk';

const response = await client.post('/v1/chat/completions', {
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
  stream: true,
});

for await (const chunk of streamSSE(response)) {
  process.stdout.write(chunk.choices?.[0]?.delta?.content ?? '');
}
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AILINK_API_KEY` | Virtual token for authentication | — |
| `AILINK_GATEWAY_URL` | Gateway base URL | `http://localhost:8443` |
| `AILINK_ADMIN_KEY` | Admin key for management API | — |

## Requirements

- Node.js 18+ (uses native `fetch`)
- TypeScript 5.5+ (for best type inference)
- `openai` package for `client.openai()` (optional peer dep)
- `@anthropic-ai/sdk` for `client.anthropic()` (optional peer dep)
