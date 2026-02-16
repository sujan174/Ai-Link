const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:8443";
// Hardcoding for dev to ensure it works even if .env is stale
const ADMIN_KEY = "ailink-admin-test";

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let url = `${GATEWAY_URL}/api/v1${path}`;

  // Inject project_id if present (client-side only)
  if (typeof window !== "undefined") {
    const projectId = localStorage.getItem("ailink_project_id");
    if (projectId) {
      const separator = url.includes("?") ? "&" : "?";
      url = `${url}${separator}project_id=${projectId}`;
    }
  }

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": ADMIN_KEY,
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
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
}

export interface CreateTokenRequest {
  name: string;
  credential_id: string;
  upstream_url: string;
  project_id?: string;
  policy_ids?: string[];
}

export interface CreateTokenResponse {
  token_id: string;
  name: string;
  message: string;
}

// ── API Functions ──────────────────────────────

export const listTokens = () => api<Token[]>("/tokens");

export const createToken = (data: CreateTokenRequest) =>
  api<CreateTokenResponse>("/tokens", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const listApprovals = () => api<ApprovalRequest[]>("/approvals");

export const decideApproval = (id: string, decision: "approved" | "rejected") =>
  api<{ id: string; status: string; updated: boolean }>(
    `/approvals/${id}/decision`,
    {
      method: "POST",
      body: JSON.stringify({ decision }),
    }
  );

export const listAuditLogs = (limit = 50, offset = 0) =>
  api<AuditLog[]>(`/audit?limit=${limit}&offset=${offset}`);

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

export const createPolicy = (data: CreatePolicyRequest) =>
  api<{ id: string; name: string; message: string }>("/policies", {
    method: "POST",
    body: JSON.stringify(data),
  });

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
