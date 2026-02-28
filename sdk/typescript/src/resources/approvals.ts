import type { HttpClient } from "../http.js";
import type { ApprovalRequest, ApprovalDecision, PaginationOptions } from "../types.js";

export class ApprovalsResource {
    constructor(private readonly http: HttpClient) { }

    /** List pending approval requests. */
    async list(options: PaginationOptions & { status?: string; projectId?: string } = {}): Promise<ApprovalRequest[]> {
        const res = await this.http.get("/api/v1/approvals", { params: { limit: options.limit, offset: options.offset, status: options.status, project_id: options.projectId } });
        return (await res.json()) as ApprovalRequest[];
    }

    /** Get a single approval request by ID. */
    async get(approvalId: string): Promise<ApprovalRequest> {
        const res = await this.http.get(`/api/v1/approvals/${approvalId}`);
        return (await res.json()) as ApprovalRequest;
    }

    /** Submit an approval decision (approve or reject). */
    async decide(approvalId: string, decision: "approved" | "rejected"): Promise<ApprovalDecision> {
        const res = await this.http.post(`/api/v1/approvals/${approvalId}/decide`, { decision });
        return (await res.json()) as ApprovalDecision;
    }

    /** Convenience: approve a pending request. */
    async approve(approvalId: string): Promise<ApprovalDecision> {
        return this.decide(approvalId, "approved");
    }

    /** Convenience: reject a pending request. */
    async reject(approvalId: string): Promise<ApprovalDecision> {
        return this.decide(approvalId, "rejected");
    }
}
