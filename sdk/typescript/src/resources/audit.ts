import type { HttpClient } from "../http.js";
import type { AuditLog, PaginationOptions } from "../types.js";

export class AuditResource {
    constructor(private readonly http: HttpClient) { }

    /** List audit logs with pagination. */
    async list(options: PaginationOptions & { projectId?: string } = {}): Promise<AuditLog[]> {
        const res = await this.http.get("/api/v1/audit", { params: { limit: options.limit, offset: options.offset, project_id: options.projectId } });
        return (await res.json()) as AuditLog[];
    }

    /** Auto-paginating async generator over all audit logs. */
    async *listAll(options: { projectId?: string; batchSize?: number } = {}): AsyncIterable<AuditLog> {
        const batchSize = options.batchSize ?? 100;
        let offset = 0;
        while (true) {
            const batch = await this.list({ limit: batchSize, offset, projectId: options.projectId });
            if (batch.length === 0) break;
            yield* batch;
            if (batch.length < batchSize) break;
            offset += batchSize;
        }
    }
}
