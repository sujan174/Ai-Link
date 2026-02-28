import type { HttpClient } from "../http.js";
import type { Policy, PolicyCreateResponse, PolicyRule, PaginationOptions, JsonObject } from "../types.js";

export class PoliciesResource {
    constructor(private readonly http: HttpClient) { }

    /** Create a security policy. Rules use `when`/`then` syntax. */
    async create(options: { name: string; rules: PolicyRule[]; mode?: string; phase?: string; projectId?: string }): Promise<PolicyCreateResponse> {
        const body: Record<string, unknown> = { name: options.name, rules: options.rules };
        if (options.mode) body["mode"] = options.mode;
        if (options.phase) body["phase"] = options.phase;
        if (options.projectId) body["project_id"] = options.projectId;
        const res = await this.http.post("/api/v1/policies", body);
        return (await res.json()) as PolicyCreateResponse;
    }

    /** List all policies. */
    async list(options: PaginationOptions & { projectId?: string } = {}): Promise<Policy[]> {
        const res = await this.http.get("/api/v1/policies", { params: { limit: options.limit, offset: options.offset, project_id: options.projectId } });
        return (await res.json()) as Policy[];
    }

    /** Get a policy by ID. */
    async get(policyId: string): Promise<Policy> {
        const res = await this.http.get(`/api/v1/policies/${policyId}`);
        return (await res.json()) as Policy;
    }

    /** Update a policy. */
    async update(policyId: string, updates: { name?: string; rules?: PolicyRule[]; mode?: string }): Promise<JsonObject> {
        const res = await this.http.put(`/api/v1/policies/${policyId}`, updates);
        return (await res.json()) as JsonObject;
    }

    /** Delete a policy. */
    async delete(policyId: string): Promise<void> {
        await this.http.delete(`/api/v1/policies/${policyId}`);
    }
}
