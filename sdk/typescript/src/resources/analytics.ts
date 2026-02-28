import type { HttpClient } from "../http.js";
import type { JsonObject } from "../types.js";

export class AnalyticsResource {
    constructor(private readonly http: HttpClient) { }

    /** Get summary of usage and performance for all tokens. */
    async getTokenSummary(): Promise<JsonObject[]> {
        const res = await this.http.get("/analytics/tokens");
        return (await res.json()) as JsonObject[];
    }

    /** Get hourly request volume for a specific token. */
    async getTokenVolume(tokenId: string): Promise<JsonObject[]> {
        const res = await this.http.get(`/analytics/tokens/${tokenId}/volume`);
        return (await res.json()) as JsonObject[];
    }

    /** Get status code distribution for a specific token. */
    async getTokenStatus(tokenId: string): Promise<JsonObject[]> {
        const res = await this.http.get(`/analytics/tokens/${tokenId}/status`);
        return (await res.json()) as JsonObject[];
    }

    /** Get latency percentiles for a specific token. */
    async getTokenLatency(tokenId: string): Promise<Record<string, number>> {
        const res = await this.http.get(`/analytics/tokens/${tokenId}/latency`);
        return (await res.json()) as Record<string, number>;
    }

    /** Get spend breakdown grouped by a chosen dimension. */
    async spendBreakdown(options: { groupBy?: string; hours?: number; projectId?: string } = {}): Promise<JsonObject> {
        const res = await this.http.get("/api/v1/analytics/spend/breakdown", {
            params: { group_by: options.groupBy ?? "model", hours: options.hours ?? 720, project_id: options.projectId },
        });
        return (await res.json()) as JsonObject;
    }
}
