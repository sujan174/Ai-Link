import type { HttpClient } from "../http.js";
import type { JsonObject, CursorPaginationOptions } from "../types.js";

export class FineTuningResource {
    constructor(private readonly http: HttpClient) { }

    /** Create a fine-tuning job. */
    async createJob(options: { model: string; trainingFile: string; validationFile?: string; hyperparameters?: Record<string, unknown>; suffix?: string; seed?: number }): Promise<JsonObject> {
        const body: Record<string, unknown> = { model: options.model, training_file: options.trainingFile };
        if (options.validationFile) body["validation_file"] = options.validationFile;
        if (options.hyperparameters) body["hyperparameters"] = options.hyperparameters;
        if (options.suffix) body["suffix"] = options.suffix;
        if (options.seed !== undefined) body["seed"] = options.seed;
        const res = await this.http.post("/v1/fine_tuning/jobs", body);
        return (await res.json()) as JsonObject;
    }

    /** List fine-tuning jobs. */
    async listJobs(options: CursorPaginationOptions = {}): Promise<JsonObject> {
        const res = await this.http.get("/v1/fine_tuning/jobs", { params: { limit: options.limit ?? 20, after: options.after } });
        return (await res.json()) as JsonObject;
    }

    /** Retrieve a fine-tuning job by ID. */
    async getJob(jobId: string): Promise<JsonObject> {
        const res = await this.http.get(`/v1/fine_tuning/jobs/${jobId}`);
        return (await res.json()) as JsonObject;
    }

    /** Cancel a running fine-tuning job. */
    async cancelJob(jobId: string): Promise<JsonObject> {
        const res = await this.http.post(`/v1/fine_tuning/jobs/${jobId}/cancel`, {});
        return (await res.json()) as JsonObject;
    }

    /** List events for a fine-tuning job. */
    async listEvents(jobId: string, options: CursorPaginationOptions = {}): Promise<JsonObject> {
        const res = await this.http.get(`/v1/fine_tuning/jobs/${jobId}/events`, { params: { limit: options.limit ?? 20, after: options.after } });
        return (await res.json()) as JsonObject;
    }

    /** List checkpoints for a fine-tuning job. */
    async listCheckpoints(jobId: string, options: CursorPaginationOptions = {}): Promise<JsonObject> {
        const res = await this.http.get(`/v1/fine_tuning/jobs/${jobId}/checkpoints`, { params: { limit: options.limit ?? 10, after: options.after } });
        return (await res.json()) as JsonObject;
    }
}
