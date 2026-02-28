import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApprovalsResource } from "../src/resources/approvals.js";
import { HttpClient } from "../src/http.js";

function okResponse(body: unknown = {}): Response {
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function createMockHttp(): HttpClient & { post: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> } {
    return {
        post: vi.fn().mockResolvedValue(okResponse({})),
        get: vi.fn().mockResolvedValue(okResponse([])),
        put: vi.fn(),
        delete: vi.fn(),
        patch: vi.fn(),
        raw: vi.fn(),
        request: vi.fn(),
        baseUrl: "https://gw.test",
    } as unknown as HttpClient & { post: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
}

describe("ApprovalsResource", () => {
    let approvals: ApprovalsResource;
    let http: ReturnType<typeof createMockHttp>;

    beforeEach(() => {
        http = createMockHttp();
        approvals = new ApprovalsResource(http);
    });

    it("list retrieves pending approvals", async () => {
        http.get.mockResolvedValueOnce(okResponse([{ id: "apr_1", status: "pending" }]));
        const result = await approvals.list({ status: "pending" });
        expect(http.get).toHaveBeenCalledWith("/api/v1/approvals", expect.objectContaining({
            params: expect.objectContaining({ status: "pending" }),
        }));
        expect(result).toHaveLength(1);
    });

    it("get retrieves a single approval", async () => {
        http.get.mockResolvedValueOnce(okResponse({ id: "apr_1", status: "pending" }));
        const result = await approvals.get("apr_1");
        expect(http.get).toHaveBeenCalledWith("/api/v1/approvals/apr_1");
        expect(result.status).toBe("pending");
    });

    it("decide sends approved decision", async () => {
        http.post.mockResolvedValueOnce(okResponse({ id: "apr_1", status: "approved", updated: true }));
        const result = await approvals.decide("apr_1", "approved");
        expect(http.post).toHaveBeenCalledWith("/api/v1/approvals/apr_1/decide", { decision: "approved" });
        expect(result.status).toBe("approved");
    });

    it("approve is a convenience method", async () => {
        http.post.mockResolvedValueOnce(okResponse({ id: "apr_1", status: "approved", updated: true }));
        await approvals.approve("apr_1");
        expect(http.post).toHaveBeenCalledWith("/api/v1/approvals/apr_1/decide", { decision: "approved" });
    });

    it("reject is a convenience method", async () => {
        http.post.mockResolvedValueOnce(okResponse({ id: "apr_1", status: "rejected", updated: true }));
        await approvals.reject("apr_1");
        expect(http.post).toHaveBeenCalledWith("/api/v1/approvals/apr_1/decide", { decision: "rejected" });
    });
});
