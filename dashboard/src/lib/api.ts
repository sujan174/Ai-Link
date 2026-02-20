// Use relative path to hit the Next.js proxy
const BASE_URL = "/api/proxy";

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let url = `${BASE_URL}${path}`;

  // Inject project_id if present (client-side only)
  if (typeof window !== "undefined") {
    const projectId = localStorage.getItem("ailink_project_id");
    if (projectId) {
      const separator = url.includes("?") ? "&" : "?";
      url = `${url}${separator}project_id=${projectId}`;
    }
  }

  const res = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }

  if (res.status === 204) {
    return null as T;
  }

  return res.json();

}

// ── Types ──────────────────────────────────────

export interface Token {
  id: string;
  project_id: string;
  name: string;
  credential_id: string;
  upstream_url: string;
  scopes: unknown;
  policy_ids: string[];
  log_level: number;
  is_active: boolean;
  created_at: string;
}

export interface ApprovalRequest {
  id: string;
  token_id: string | null;
  project_id: string;
  idempotency_key: string | null;
  request_summary: Record<string, unknown>;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  created_at: string;
  token_id: string | null;
  method: string;
  path: string;
  upstream_status: number | null;
  response_latency_ms: number;
  agent_name: string | null;
  policy_result: string;
  estimated_cost_usd: string | null;
  shadow_violations: string[] | null;
  fields_redacted: string[] | null;
  // Phase 4: AI golden signals
  prompt_tokens: number | null;
  completion_tokens: number | null;
  model: string | null;
  tokens_per_second: number | null;
  // Phase 4: Attribution
  user_id: string | null;
  tenant_id: string | null;
  external_request_id: string | null;
  log_level: number | null;
  // Phase 5: LLM Observability
  tool_call_count: number | null;
  finish_reason: string | null;
  error_type: string | null;
  is_streaming: boolean | null;
  // Phase 6: Caching & Router
  cache_hit: boolean | null;
}

export interface AuditLogDetail extends AuditLog {
  upstream_url: string;
  policy_mode: string | null;
  deny_reason: string | null;
  // Phase 5: LLM Observability (detail only)
  tool_calls: unknown[] | null;
  session_id: string | null;
  parent_span_id: string | null;
  ttft_ms: number | null;
  // Bodies (from joined audit_log_bodies table)
  request_body: string | null;
  response_body: string | null;
  request_headers: Record<string, string> | null;
  response_headers: Record<string, string> | null;
  // Router
  router_info: { detected_provider?: string; original_model?: string; translated_model?: string } | null;
}

export interface UpstreamEntry {
  url: string;
  weight?: number;
  priority?: number;
}

export interface CreateTokenRequest {
  name: string;
  credential_id: string;
  upstream_url: string;
  project_id?: string;
  policy_ids?: string[];
  upstreams?: UpstreamEntry[];
  log_level?: number;
}

export interface CreateTokenResponse {
  token_id: string;
  name: string;
  message: string;
}

// ── API Functions ──────────────────────────────

export const listTokens = () => api<Token[]>("/tokens");

export const getToken = (id: string) => api<Token>(`/tokens/${id}`);

export const createToken = (data: CreateTokenRequest) => {
  if (!data.project_id && typeof window !== "undefined") {
    const pid = localStorage.getItem("ailink_project_id");
    if (pid) data.project_id = pid;
  }
  return api<CreateTokenResponse>("/tokens", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

export const listApprovals = () => api<ApprovalRequest[]>("/approvals");

export const decideApproval = (id: string, decision: "approved" | "rejected") =>
  api<{ id: string; status: string; updated: boolean }>(
    `/approvals/${id}/decision`,
    {
      method: "POST",
      body: JSON.stringify({ decision }),
    }
  );

export const listAuditLogs = (limit = 50, offset = 0, filters?: { token_id?: string }) => {
  let qs = `limit=${limit}&offset=${offset}`;
  if (filters?.token_id) qs += `&token_id=${filters.token_id}`;
  return api<AuditLog[]>(`/audit?${qs}`);
};

export const getAuditLogDetail = (id: string) =>
  api<AuditLogDetail>(`/audit/${id}`);

export const swrFetcher = <T>(path: string) => api<T>(path);

// ── Upstream Health ─────────────────────────────

export interface UpstreamStatus {
  token_id: string;
  url: string;
  is_healthy: boolean;
  failure_count: number;
  cooldown_remaining_secs: number | null;
}

export const getUpstreamHealth = () =>
  api<UpstreamStatus[]>('/health/upstreams');

// ── Policy Types & API ─────────────────────────

export interface Policy {
  id: string;
  project_id: string;
  name: string;
  mode: string;
  rules: unknown[];
  is_active: boolean;
  created_at: string;
}

export interface CreatePolicyRequest {
  name: string;
  mode?: string;
  rules: unknown[];
  project_id?: string;
}

export const listPolicies = () => api<Policy[]>("/policies");

export const createPolicy = (data: CreatePolicyRequest) => {
  if (!data.project_id && typeof window !== "undefined") {
    const pid = localStorage.getItem("ailink_project_id");
    if (pid) data.project_id = pid;
  }
  return api<{ id: string; name: string; message: string }>("/policies", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

export const updatePolicy = (id: string, data: { name?: string; mode?: string; rules?: unknown[] }) =>
  api<{ id: string; name: string; message: string }>(`/policies/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });

export const deletePolicy = (id: string) =>
  api<{ id: string; deleted: boolean }>(`/policies/${id}`, {
    method: "DELETE",
  });

// ── Credential Types & API ─────────────────────

export interface Credential {
  id: string;
  name: string;
  provider: string;
  version: number;
  is_active: boolean;
  created_at: string;
}

export const listCredentials = () => api<Credential[]>("/credentials");

export const createCredential = (data: { name: string; provider: string; secret: string }) =>
  api<{ id: string; name: string; message: string }>("/credentials", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const rotateCredential = (id: string) =>
  api<{ id: string; secret: string; message: string }>(`/credentials/${id}/rotate`, {
    method: "POST",
  });

// ── Token Revocation ───────────────────────────

export const revokeToken = (tokenId: string) =>
  api<{ token_id: string; revoked: boolean }>(`/tokens/${tokenId}`, {
    method: "DELETE",
  });

// ── Analytics Types & API ──────────────────────

export interface VolumeStat {
  bucket: string;
  count: number;
}

export interface StatusStat {
  status_class: number;
  count: number;
}

export interface LatencyStat {
  p50: number;
  p90: number;
  p99: number;
  avg: number;
}

export const getRequestVolume = () => api<VolumeStat[]>("/analytics/volume");

export const getStatusDistribution = () => api<StatusStat[]>("/analytics/status");

export const getLatencyPercentiles = () => api<LatencyStat>("/analytics/latency");

// ── Project Types & API ────────────────────────

export interface Project {
  id: string;
  org_id: string;
  name: string;
  created_at: string;
}

export const listProjects = () => api<Project[]>("/projects");

export const createProject = (name: string) =>
  api<{ id: string; name: string }>("/projects", {
    method: "POST",
    body: JSON.stringify({ name }),
  });

export const updateProject = (id: string, name: string) =>
  api<{ id: string; name: string }>(`/projects/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });

export const deleteProject = (id: string) =>
  api<void>(`/projects/${id}`, {
    method: "DELETE",
  });

// ── System API ─────────────────────────────────

export const getHealth = () => api<{ status: string }>("/healthz");

// ── Policy Versions ──────────────────────────

export interface PolicyVersion {
  id: string;
  policy_id: string;
  version: number;
  name: string | null;
  mode: string | null;
  phase: string | null;
  rules: unknown[];
  retry: unknown | null;
  changed_by: string | null;
  created_at: string;
}

export const listPolicyVersions = (policyId: string) =>
  api<PolicyVersion[]>(`/policies/${policyId}/versions`);

// ── Token Usage ──────────────────────────────

export interface TokenUsageBucket {
  bucket: string;
  count: number;
}

export interface TokenUsageStats {
  total_requests: number;
  success_count: number;
  error_count: number;
  avg_latency_ms: number;
  total_cost_usd: number;
  hourly: TokenUsageBucket[];
}

export const getTokenUsage = (tokenId: string) =>
  api<TokenUsageStats>(`/tokens/${tokenId}/usage`);

// ── Notifications ────────────────────────────

export interface Notification {
  id: string;
  project_id: string;
  type: string;
  title: string;
  body: string | null;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

export const listNotifications = () => api<Notification[]>("/notifications");

export const countUnreadNotifications = () =>
  api<{ count: number }>("/notifications/unread");

export const markNotificationRead = (id: string) =>
  api<{ success: boolean }>(`/notifications/${id}/read`, { method: "POST" });

export const markAllNotificationsRead = () =>
  api<{ success: boolean }>("/notifications/read-all", { method: "POST" });

// ── Services (Action Gateway) ────────────────

export interface Service {
  id: string;
  project_id: string;
  name: string;
  description: string;
  base_url: string;
  service_type: string;
  credential_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const listServices = () => api<Service[]>("/services");

export const createService = (data: {
  name: string;
  description?: string;
  base_url: string;
  service_type?: string;
  credential_id?: string;
}) => {
  const payload = { ...data, project_id: undefined };
  if (typeof window !== "undefined") {
    const pid = localStorage.getItem("ailink_project_id");
    if (pid) (payload as any).project_id = pid;
  }
  return api<Service>("/services", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const deleteService = (id: string) =>
  api<{ deleted: boolean }>(`/services/${id}`, { method: "DELETE" });

// ── SSE Stream ───────────────────────────────

export const streamAuditLogs = (onEvent: (log: AuditLog) => void) => {
  const projectId = typeof window !== "undefined" ? localStorage.getItem("ailink_project_id") : null;
  const url = `${BASE_URL}/audit/stream${projectId ? `?project_id=${projectId}` : ""}`;
  const evtSource = new EventSource(url);

  evtSource.addEventListener("audit", (e) => {
    try {
      const logs: AuditLog[] = JSON.parse(e.data);
      logs.forEach(onEvent);
    } catch (err) {
      console.error("Failed to parse SSE audit event", err);
    }
  });

  return () => evtSource.close();
};

// ── API Keys ──────────────────────────────────────────────

export interface ApiKey {
  id: string;
  org_id: string;
  user_id: string | null;
  name: string;
  key_prefix: string;
  role: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CreateApiKeyRequest {
  name: string;
  role: string;
  scopes: string[];
  key_prefix?: string;
}

export interface CreateApiKeyResponse {
  key: string;
  id: string;
  name: string;
}

export async function listApiKeys(): Promise<ApiKey[]> {
  return api("/auth/keys");
}

export async function createApiKey(req: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
  return api("/auth/keys", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function revokeApiKey(id: string): Promise<boolean> {
  // Returns boolean if successful (true) or throws
  await api(`/auth/keys/${id}`, { method: "DELETE" });
  return true;
}

export async function getWhoAmI(): Promise<any> {
  return api("/auth/whoami");
}

// ── Billing ───────────────────────────────────────────────

export interface UsageMeter {
  org_id: string;
  period: string; // YYYY-MM
  total_requests: number;
  total_tokens_used: number;
  total_spend_usd: number;
  updated_at: string;
}

export async function getUsage(period?: string): Promise<UsageMeter> {
  const query = period ? `?period=${period}` : "";
  return api(`/billing/usage${query}`);
}

// ── Analytics ─────────────────────────────────────────────

export interface TokenSummary {
  token_id: string;
  total_requests: number;
  errors: number;
  avg_latency_ms: number;
  last_active: string | null;
}

export interface TokenVolume {
  hour: string;
  count: number;
}

export interface TokenStatus {
  status: number;
  count: number;
}

export interface TokenLatency {
  p50: number;
  p90: number;
  p99: number;
}

export async function getTokenAnalytics(): Promise<TokenSummary[]> {
  return api("/analytics/tokens");
}

export async function getTokenVolume(tokenId: string): Promise<TokenVolume[]> {
  return api(`/analytics/tokens/${tokenId}/volume`);
}

export async function getTokenStatus(tokenId: string): Promise<TokenStatus[]> {
  return api(`/analytics/tokens/${tokenId}/status`);
}

export async function getTokenLatency(tokenId: string): Promise<TokenLatency> {
  return api(`/analytics/tokens/${tokenId}/latency`);
}

// ── Spend Caps ────────────────────────────────────────────────

export interface SpendStatus {
  daily_limit_usd: number | null;
  monthly_limit_usd: number | null;
  current_daily_usd: number;
  current_monthly_usd: number;
}

export async function getSpendCaps(tokenId: string): Promise<SpendStatus> {
  return api(`/tokens/${tokenId}/spend`);
}

export async function upsertSpendCap(
  tokenId: string,
  period: "daily" | "monthly",
  limit_usd: number
): Promise<void> {
  return api(`/tokens/${tokenId}/spend`, {
    method: "PUT",
    body: JSON.stringify({ period, limit_usd }),
  });
}

export async function deleteSpendCap(
  tokenId: string,
  period: "daily" | "monthly"
): Promise<void> {
  return api(`/tokens/${tokenId}/spend/${period}`, { method: "DELETE" });
}

// ── Webhooks ──────────────────────────────────────────────────

export interface Webhook {
  id: string;
  project_id: string;
  url: string;
  events: string[];
  is_active: boolean;
  created_at: string;
}

export interface TestWebhookResponse {
  success: boolean;
  message: string;
}

export async function listWebhooks(): Promise<Webhook[]> {
  return api("/webhooks");
}

export async function createWebhook(data: {
  url: string;
  events?: string[];
}): Promise<Webhook> {
  return api("/webhooks", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteWebhook(id: string): Promise<void> {
  return api(`/webhooks/${id}`, { method: "DELETE" });
}

export async function testWebhook(url: string): Promise<TestWebhookResponse> {
  return api("/webhooks/test", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

// ── Analytics (Phase 8) ──────────────────────────────────────

export interface AnalyticsSummary {
  total_requests: number;
  success_count: number;
  error_count: number;
  avg_latency: number;
  total_cost: number;
  total_tokens: number;
}

export interface AnalyticsTimeseriesPoint {
  bucket: string;
  request_count: number;
  error_count: number;
  cost: number;
  lat: number;
}

// ── System Settings (Phase 9) ────────────────────────────────

export interface SystemSettings {
  [key: string]: unknown;
}

export const getSettings = () => api<SystemSettings>("/settings");

export const updateSettings = (settings: SystemSettings) =>
  api<{ success: boolean }>("/settings", {
    method: "PUT",
    body: JSON.stringify({ settings }),
  });

export const flushCache = () =>
  api<{ success: boolean; message: string }>("/system/flush-cache", {
    method: "POST",
  });
