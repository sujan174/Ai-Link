import type { HttpClient } from "../http.js";
import type { JsonObject, CursorPaginationOptions } from "../types.js";

export class BatchesResource {
    constructor(private readonly http: HttpClient) { }

    /** Create a new batch job. */
    async create(options: { inputFileId: string; endpoint: string; completionWindow?: string; metadata?: Record<string, string> }): Promise<JsonObject> {
        const body: Record<string, unknown> = { input_file_id: options.inputFileId, endpoint: options.endpoint, completion_window: options.completionWindow ?? "24h" };
        if (options.metadata) body["metadata"] = options.metadata;
        const res = await this.http.post("/v1/batches", body);
        return (await res.json()) as JsonObject;
    }

    /** Retrieve a batch job by ID. */
    async retrieve(batchId: string): Promise<JsonObject> {
        const res = await this.http.get(`/v1/batches/${batchId}`);
        return (await res.json()) as JsonObject;
    }

    /** List batch jobs. */
    async list(options: CursorPaginationOptions = {}): Promise<JsonObject> {
        const res = await this.http.get("/v1/batches", { params: { limit: options.limit ?? 20, after: options.after } });
        return (await res.json()) as JsonObject;
    }

    /** Cancel a pending or in-progress batch job. */
    async cancel(batchId: string): Promise<JsonObject> {
        const res = await this.http.post(`/v1/batches/${batchId}/cancel`, {});
        return (await res.json()) as JsonObject;
    }
}
