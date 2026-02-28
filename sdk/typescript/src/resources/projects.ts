import type { HttpClient } from "../http.js";
import type { JsonObject } from "../types.js";

export class ProjectsResource {
    constructor(private readonly http: HttpClient) { }

    /** List all projects. */
    async list(): Promise<JsonObject[]> {
        const res = await this.http.get("/api/v1/projects");
        return (await res.json()) as JsonObject[];
    }

    /** Create a new project. */
    async create(name: string): Promise<JsonObject> {
        const res = await this.http.post("/api/v1/projects", { name });
        return (await res.json()) as JsonObject;
    }

    /** Delete a project. */
    async delete(projectId: string): Promise<void> {
        await this.http.delete(`/api/v1/projects/${projectId}`);
    }
}
