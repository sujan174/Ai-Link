import type { HttpClient } from "../http.js";
import type { JsonObject } from "../types.js";

export class ConfigResource {
    constructor(private readonly http: HttpClient) { }

    /** Export all policies and tokens as YAML string or JSON object. */
    async export(options: { format?: "yaml" | "json"; projectId?: string } = {}): Promise<string | JsonObject> {
        const format = options.format ?? "yaml";
        const res = await this.http.get("/api/v1/config/export", { params: { format, project_id: options.projectId } });
        return format === "json" ? ((await res.json()) as JsonObject) : await res.text();
    }

    /** Export policies only. */
    async exportPolicies(options: { format?: "yaml" | "json"; projectId?: string } = {}): Promise<string | JsonObject> {
        const format = options.format ?? "yaml";
        const res = await this.http.get("/api/v1/config/export/policies", { params: { format, project_id: options.projectId } });
        return format === "json" ? ((await res.json()) as JsonObject) : await res.text();
    }

    /** Export tokens only. */
    async exportTokens(options: { format?: "yaml" | "json"; projectId?: string } = {}): Promise<string | JsonObject> {
        const format = options.format ?? "yaml";
        const res = await this.http.get("/api/v1/config/export/tokens", { params: { format, project_id: options.projectId } });
        return format === "json" ? ((await res.json()) as JsonObject) : await res.text();
    }

    /**
     * Import (upsert) configuration from a YAML/JSON string or object.
     *
     * @example
     * ```ts
     * const result = await client.config.importConfig(yamlString);
     * console.log(result.policies_created, result.tokens_created);
     * ```
     */
    async importConfig(config: string | JsonObject, options: { projectId?: string } = {}): Promise<JsonObject> {
        const isObject = typeof config === "object";
        const body = isObject ? JSON.stringify(config) : config;
        const contentType = isObject ? "application/json" : "application/yaml";
        const res = await this.http.raw("/api/v1/config/import", {
            method: "POST",
            body,
            headers: { "Content-Type": contentType },
            params: { project_id: options.projectId },
        });
        return (await res.json()) as JsonObject;
    }
}
