import type { HttpClient } from "../http.js";
import type { Service, JsonObject } from "../types.js";

export class ServicesResource {
    constructor(private readonly http: HttpClient) { }

    /** List all registered services. */
    async list(options: { projectId?: string } = {}): Promise<Service[]> {
        const res = await this.http.get("/api/v1/services", { params: { project_id: options.projectId } });
        return (await res.json()) as Service[];
    }

    /** Register a new external service. */
    async create(options: { name: string; baseUrl: string; description?: string; serviceType?: string; credentialId?: string; projectId?: string }): Promise<JsonObject> {
        const body: Record<string, unknown> = { name: options.name, base_url: options.baseUrl, description: options.description ?? "", service_type: options.serviceType ?? "generic" };
        if (options.credentialId) body["credential_id"] = options.credentialId;
        if (options.projectId) body["project_id"] = options.projectId;
        const res = await this.http.post("/api/v1/services", body);
        return (await res.json()) as JsonObject;
    }

    /** Delete a registered service. */
    async delete(serviceId: string, options: { projectId?: string } = {}): Promise<JsonObject> {
        const res = await this.http.delete(`/api/v1/services/${serviceId}`, { params: { project_id: options.projectId } });
        return (await res.json()) as JsonObject;
    }
}
