import type { HttpClient } from "../http.js";
import type { JsonObject } from "../types.js";

export class ModelAliasesResource {
    constructor(private readonly http: HttpClient) { }

    /** Create a model alias. */
    async create(alias: string, model: string, options: { projectId?: string } = {}): Promise<JsonObject> {
        const body: Record<string, unknown> = { alias, model };
        if (options.projectId) body["project_id"] = options.projectId;
        const res = await this.http.post("/api/v1/model-aliases", body);
        return (await res.json()) as JsonObject;
    }

    /** List all model aliases. */
    async list(options: { projectId?: string } = {}): Promise<JsonObject[]> {
        const res = await this.http.get("/api/v1/model-aliases", { params: { project_id: options.projectId } });
        return (await res.json()) as JsonObject[];
    }

    /** Get a model alias by name. */
    async get(alias: string): Promise<JsonObject> {
        const res = await this.http.get(`/api/v1/model-aliases/${alias}`);
        return (await res.json()) as JsonObject;
    }

    /** Delete a model alias. */
    async delete(alias: string): Promise<void> {
        await this.http.delete(`/api/v1/model-aliases/${alias}`);
    }

    /** Create multiple aliases at once from a mapping object. */
    async bulkCreate(aliases: Record<string, string>, options: { projectId?: string } = {}): Promise<JsonObject[]> {
        const results: JsonObject[] = [];
        for (const [alias, model] of Object.entries(aliases)) {
            results.push(await this.create(alias, model, options));
        }
        return results;
    }
}
