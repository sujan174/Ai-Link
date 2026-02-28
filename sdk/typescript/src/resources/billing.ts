import type { HttpClient } from "../http.js";
import type { JsonObject } from "../types.js";

export class BillingResource {
    constructor(private readonly http: HttpClient) { }

    /** Get usage metrics for the current organization. */
    async getUsage(options: { period?: string } = {}): Promise<JsonObject> {
        const res = await this.http.get("/billing/usage", { params: { period: options.period } });
        return (await res.json()) as JsonObject;
    }
}
