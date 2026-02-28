import type { HttpClient } from "../http.js";
import type { JsonObject } from "../types.js";

export class WebhooksResource {
    constructor(private readonly http: HttpClient) { }

    /** Create a webhook subscription. */
    async create(options: { url: string; events?: string[]; secret?: string }): Promise<JsonObject> {
        const body: Record<string, unknown> = { url: options.url };
        if (options.events) body["events"] = options.events;
        if (options.secret) body["signing_secret"] = options.secret;
        const res = await this.http.post("/api/v1/webhooks", body);
        return (await res.json()) as JsonObject;
    }

    /** List all webhook subscriptions. */
    async list(): Promise<JsonObject[]> {
        const res = await this.http.get("/api/v1/webhooks");
        return (await res.json()) as JsonObject[];
    }

    /** Get a single webhook by ID. */
    async get(webhookId: string): Promise<JsonObject> {
        const res = await this.http.get(`/api/v1/webhooks/${webhookId}`);
        return (await res.json()) as JsonObject;
    }

    /** Delete a webhook subscription. */
    async delete(webhookId: string): Promise<void> {
        await this.http.delete(`/api/v1/webhooks/${webhookId}`);
    }

    /** Send a synthetic test event to the webhook. */
    async test(webhookId: string): Promise<JsonObject> {
        const res = await this.http.post(`/api/v1/webhooks/${webhookId}/test`);
        return (await res.json()) as JsonObject;
    }

    /** List delivery attempts for a webhook. */
    async deliveries(webhookId: string, options: { limit?: number; offset?: number } = {}): Promise<JsonObject[]> {
        const res = await this.http.get(`/api/v1/webhooks/${webhookId}/deliveries`, { params: { limit: options.limit ?? 50, offset: options.offset ?? 0 } });
        return (await res.json()) as JsonObject[];
    }
}
