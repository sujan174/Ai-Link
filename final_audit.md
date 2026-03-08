cat > final_review.md << 'EOF'
```

Paste this as the content:
```
You are the orchestrator for a final comprehensive audit
of a production Rust AI gateway. You have access to two
MCP tools that previous audits did not have:

- semgrep: deterministic static analysis, 5000+ rules
- serena: semantic code navigation via rust-analyzer

SCOPE: src/ directory only. Do NOT touch python_sdk/,
dashboard/, scripts/, or tests/ unless a finding
requires reading a test for context.

Spawn all 8 agents simultaneously using the Task tool.

RULES FOR ALL AGENTS:
- Start EVERY investigation with Semgrep or Serena,
  not manual file reading
- Use Serena find_symbol and get_references to trace
  actual call chains — do not guess
- Use Semgrep for pattern-based scanning before reading
- Only read a file when Semgrep or Serena points to it
- CONFIRMED requires: semgrep hit OR serena call chain
- Do not report anything without a tool-verified anchor
- Never grep manually if Serena can answer it

KNOWN FIXED — NEVER REPORT:
MCP blocklist, stream_options panic, topic allowlist,
SSRF hostname, readiness probe, Lua spend bypass,
budget cap bypass, guardrail array bypass, HITL DoS,
RR_COUNTERS OOM, buffered streaming billing, PII cache
bleed, experiment scope, in-flight counter, stream
timeout, MCP intermediate tokens, graceful shutdown,
key rotation coherence, latency bleed, circuit breaker,
half-open herd, reqwest per-request, cache LRU,
Postgres retry, Anthropic token drop, denied ledger,
SSE post-flight, TCP fragmentation, analytics auth,
config export auth, credential delete scope, PII logs,
X-Forwarded-For, cross-cap rollback, error billing,
budget fail-open, MCP project isolation, MCP guardrails,
MCP cumulative billing, approval expiry, job panic
recovery, prompt version race, pagination ORDER BY,
cache TOCTOU, Gemini normalization, cached response
billing, missing usage estimate, OAuth expect(),
stream spawn logging, startup expect() fixes,
header injection, f64 bounds check, usage warn log,
post-flight billing bypass, circuit breaker cross-tenant,
prompt handler scope checks, experiment handler scope
checks, deploy prompt transaction, Gemini token
estimation, Langfuse dropped JoinHandles.

FINDING FORMAT — MANDATORY:
════════════════════════════════════════
FINDING [N]
AGENT: [name]
SEVERITY: CRITICAL | HIGH | MEDIUM | LOW
STATUS: CONFIRMED | SUSPECTED
TOOL EVIDENCE: [semgrep rule hit OR serena call chain]
SOURCE: [file:line]
SINK: [file:line]
BROKEN AT: [file:line]
WHAT BREAKS: [exact behavior]
TRIGGER: [concrete steps]
IMPACT: [customer experience]
FIX: [one sentence]
════════════════════════════════════════

---

AGENT 1 — SEMGREP SECURITY SCAN

You are the static analysis agent.
Your entire job is running Semgrep and triaging results.

Step 1 — run the core security scan:
  semgrep --config p/rust src/

Step 2 — run secrets detection:
  semgrep --config p/secrets src/

Step 3 — run OWASP top 10 scan:
  semgrep --config p/owasp-top-ten src/

Step 4 — run a targeted Rust unsafe scan:
  semgrep --config p/rust-unsafe src/

For every Semgrep hit:
  Use Serena to find_symbol on the flagged function
  Read only the flagged lines plus 10 lines context
  Determine: real bug or false positive?

Cross-reference every hit against the KNOWN FIXED list.
If already fixed: mark ALREADY FIXED and skip.
If genuinely new: report with TOOL EVIDENCE = semgrep
  rule name.

Report all CONFIRMED findings.
Report count of false positives with reason.

---

AGENT 2 — AUTHENTICATION FLOW TRACER

You are the authentication boundary specialist.
Use Serena as your primary tool.

Step 1 — map all routes semantically:
  Use Serena to find_symbol for each handler
  registered in src/api/mod.rs
  List every route and its handler function.

Step 2 — for each handler use Serena to:
  get_references on verify_project_ownership
  get_references on require_scope
  get_references on require_role

Step 3 — cross-reference:
  Every handler from step 1 must appear in step 2
  calls OR be intentionally public.
  
  For any handler NOT calling auth functions:
  Read it. Is it genuinely public (health check,
  metrics) or missing auth?

Step 4 — check these specific patterns using Serena:
  
  PATTERN A: find all handlers that call require_scope
  but NOT verify_project_ownership
  → scope proves capability, not ownership
  
  PATTERN B: find all handlers reading project_id
  from request body instead of URL path
  → body project_id is not ownership-verified
  
  PATTERN C: use Serena to trace is_admin checks
  → find every place admin bypasses normal auth
  → verify admin cannot be set by user input

Report every unprotected handler with Serena evidence.

---

AGENT 3 — BILLING COMPLETENESS TRACER

You are the billing flow specialist.
Use Serena to trace every money path.

Step 1 — find the billing function:
  Use Serena find_symbol: check_and_increment_spend
  Use Serena get_references: find every call site

Step 2 — find every upstream call:
  Use Serena find_symbol for functions that call
  external HTTP providers
  List every function that sends a request upstream

Step 3 — for each upstream call site:
  Use Serena get_call_hierarchy to trace forward
  Does every path from upstream call reach
  check_and_increment_spend before returning?
  
  Verify these specific paths exist and are complete:
  - Normal proxy path → billing call
  - Streaming path → billing on stream end
  - Cache hit path → billing call (recently fixed)
  - MCP tool loop → cumulative billing (recently fixed)
  - Retry path → only successful attempt billed
  - Post-flight deny → billing before deny (recently fixed)

For each path report VERIFIED or GAP with Serena
call chain as evidence.

Also run Semgrep:
  semgrep --pattern 'return Ok($X)' \
    --lang rust src/proxy/handler.rs
  
  For each early return: verify upstream had not
  been called, or billing was already recorded.

---

AGENT 4 — DATA ISOLATION TRACER

You are the multi-tenancy specialist.
Use Serena to trace every data access path.

Step 1 — find all store functions:
  Use Serena find_symbol on every pub fn in
  src/store/postgres.rs
  List every function that queries the database.

Step 2 — for each query function:
  Use Serena to read the function body
  Does the SQL WHERE clause include project_id?
  
  Categorize each as:
  A) Scoped: has project_id filter ✓
  B) Intentionally global: pricing, model list ✓
  C) Missing scope: should have project_id ✗

Step 3 — check cross-entity access using Serena:
  For each "get by id" function (get_token_by_id,
  get_credential_by_id, get_policy_by_id, etc.):
  Does it filter by both id AND project_id?
  
  Use Serena get_references on each function:
  Do callers always pass project_id?
  Or do some callers only pass the id?

Step 4 — run Semgrep for unscoped queries:
  semgrep --pattern 'WHERE id = $X' \
    --lang rust src/store/

Report every unscoped query with table and function
name. Mark intentional globals explicitly.

---

AGENT 5 — INPUT TAINT TRACER

You are the injection specialist.
Use Serena to trace user input to dangerous sinks.

Step 1 — find all input extraction points:
  Use Serena find_symbol for Json, Query, Path,
  Form extractors in src/api/ and src/proxy/
  List every handler parameter that comes from
  user input.

Step 2 — find all dangerous sinks:
  Use Serena find_symbol for:
  - Redis key construction functions
  - SQL query functions
  - HTTP header insertion functions
  - External URL construction functions
  - Log macros that format user data

Step 3 — trace user input forward with Serena:
  For each input variable use get_references to
  see where it flows.
  Does it reach any dangerous sink without
  sanitization?
  
  Focus specifically on:
  
  REDIS KEY INJECTION:
    If user input appears in a Redis key without
    sanitization a user can inject : or * to
    access or scan other keys.
    Use Serena to find all Redis key format strings.
  
  USER-SUPPLIED REGEX:
    If user provides a regex pattern, is it
    size-limited before compilation?
    Unlimited regex = ReDoS.
    Use Serena find_symbol: compile, Regex::new
    in guardrail and pii_vault code.
  
  MODEL NAME INJECTION:
    User supplies model name → pricing lookup.
    What happens with a model name containing
    special characters or SQL metacharacters?

Run Semgrep:
  semgrep --config p/injection src/

Report every confirmed taint path with source
and sink.

---

AGENT 6 — SECRET EXPOSURE TRACER

You are the secrets specialist.
Use Serena + Semgrep together.

Step 1 — Semgrep secrets scan:
  semgrep --config p/secrets src/
  semgrep --config p/trufflesecurity.secrets src/

Step 2 — find all structs with secret fields:
  Use Serena find_symbol for structs containing
  fields named: api_key, secret, credential,
  master_key, password, token
  
  For each struct: does it derive Debug?
  If yes: the {:?} formatter will expose the
  secret value in any log line that prints
  the struct.

Step 3 — trace secret values to log sinks:
  Use Serena get_references on each secret-bearing
  struct to find every place it is logged.
  Does any log line use {:?} on the full struct?
  Does any error message include the raw value?

Step 4 — check error propagation:
  Use Serena to find all anyhow::Error chains
  that include secret values.
  Error messages returned to clients must not
  include key values, internal paths, or
  stack details.

Report every confirmed exposure path.
Mark intentional debug logging explicitly.

---

AGENT 7 — PROVIDER EDGE CASE TRACER

You are the provider integration specialist.
Use Serena to trace every provider response path.

Step 1 — find all provider response parsers:
  Use Serena find_symbol for parse_openai_response,
  parse_anthropic_response, parse_gemini_response,
  and equivalent functions in model_router.rs

Step 2 — for each parser use Serena to read it:
  Map every field access. For each field:
  - What is the fallback if absent?
  - What is the fallback if null?
  - What is the fallback if wrong type?
  Does a missing field silently produce 0 tokens?
  (0 tokens = customer gets free LLM calls)

Step 3 — check provider-specific edge cases:
  
  OpenAI:
  - finish_reason: "content_filter" → tokens billed?
  - cached_tokens in usage → double-counted?
  - HTTP 200 with error body → handled?
  
  Anthropic:
  - stop_reason: "max_tokens" → surfaced or silent?
  - empty content array → crash or handled?
  
  Gemini:
  - safetyRatings block → normalized to OpenAI?
  - promptFeedback.blockReason present → handled?
  - usageMetadata absent → estimate or zero?
  
  All providers:
  - Empty response body → what happens?
  - Response larger than configured limit → what?

Step 4 — run Semgrep:
  semgrep --pattern 'unwrap_or(0)' \
    --lang rust src/proxy/model_router.rs
  
  Every unwrap_or(0) on a token count is a
  potential free-tokens vulnerability.

Report every unhandled edge case with Serena
evidence showing the missing branch.

---

AGENT 8 — VALIDATOR (runs after 1-7 complete)

You are the validation agent.
You do NOT find new bugs.
You verify every finding from agents 1-7.

For each CONFIRMED finding:
  1. Use Serena find_symbol on the cited function
  2. Use Serena get_references to verify the
     call chain exists as described
  3. Read the exact file:line cited
  4. Determine: real bug or false positive?

For each SUSPECTED finding:
  1. Use Serena to trace the complete path
  2. Try to construct the exact trigger
  3. CONFIRM if trigger is possible
  4. CLOSE as false positive if impossible,
     explain why with Serena evidence

For each finding on the KNOWN FIXED list that
an agent reported anyway:
  Use Serena to verify the fix is actually in place
  Report: FIX VERIFIED or FIX MISSING (regression)

Output per finding:
  FINDING [N] from Agent [X]:
  VALIDATOR: CONFIRMED | FALSE POSITIVE | FIX VERIFIED
  SERENA EVIDENCE: [call chain or symbol reference]
  REASON: [what you verified]

Final output:
  CONFIRMED by severity: CRITICAL/HIGH/MEDIUM/LOW counts
  FALSE POSITIVES: count and reasons
  REGRESSIONS FOUND: any previously fixed bugs back?

---

AFTER ALL 8 AGENTS COMPLETE

Run:
  cargo check 2>&1 | grep "^error"
  cargo test --lib 2>&1 | tail -5
  cargo test --test adversarial_unit 2>&1 | tail -5
  cargo clippy 2>&1 | grep "^error"

FINAL REPORT:

SEMGREP SUMMARY:
  Rules run: [count]
  Hits: [count]
  Confirmed real bugs: [count]
  False positives: [count]

SERENA TRACES COMPLETED:
  Auth paths verified: [count]
  Billing paths verified: [count]
  Data isolation verified: [count]

CONFIRMED FINDINGS:
  CRITICAL: [list with agent, file:line, semgrep/serena evidence]
  HIGH: [list]
  MEDIUM: [list]
  LOW: [list]

REGRESSIONS: [any previously fixed bugs found broken]

CLEAN AREAS: [flows that were fully traced and verified]

HONEST VERDICT:
After Semgrep static analysis plus Serena semantic
tracing of all critical flows, what is the true
state of this gateway?
What confidence level is justified?
One paragraph to the founder — completely honest.
EOF