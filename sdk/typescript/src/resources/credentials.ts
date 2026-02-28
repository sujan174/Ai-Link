import type { HttpClient } from "../http.js";
import type { Credential, CredentialCreateResponse, PaginationOptions, JsonObject } from "../types.js";

export class CredentialsResource {
    constructor(private readonly http: HttpClient) { }

    /** Store a new encrypted credential. */
    async create(options: { name: string; provider: string; secret: string; projectId?: string; injectionMode?: string; injectionHeader?: string }): Promise<CredentialCreateResponse> {
        const body: Record<string, unknown> = { name: options.name, provider: options.provider, secret: options.secret };
        if (options.projectId) body["project_id"] = options.projectId;
        if (options.injectionMode) body["injection_mode"] = options.injectionMode;
        if (options.injectionHeader) body["injection_header"] = options.injectionHeader;
        const res = await this.http.post("/api/v1/credentials", body);
        return (await res.json()) as CredentialCreateResponse;
    }

    /** List all credentials (keys are never returned). */
    async list(options: PaginationOptions = {}): Promise<Credential[]> {
        const res = await this.http.get("/api/v1/credentials", { params: { limit: options.limit, offset: options.offset } });
        return (await res.json()) as Credential[];
    }

    /** Get a credential by ID. */
    async get(credentialId: string): Promise<Credential> {
        const res = await this.http.get(`/api/v1/credentials/${credentialId}`);
        return (await res.json()) as Credential;
    }

    /** Delete a credential. */
    async delete(credentialId: string): Promise<JsonObject> {
        const res = await this.http.delete(`/api/v1/credentials/${credentialId}`);
        return (await res.json()) as JsonObject;
    }

    /** Rotate a credential — generates a new encryption, returns new metadata. */
    async rotate(credentialId: string, newApiKey: string): Promise<JsonObject> {
        const res = await this.http.post(`/api/v1/credentials/${credentialId}/rotate`, { api_key: newApiKey });
        return (await res.json()) as JsonObject;
    }
}
