import { describe, it, expect, vi, beforeEach } from "vitest";
import { PoliciesResource } from "../src/resources/policies.js";
import { HttpClient } from "../src/http.js";

function okResponse(body: unknown = {}): Response {
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function createMockHttp(): HttpClient & { post: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> } {
    return {
        post: vi.fn().mockResolvedValue(okResponse({})),
        get: vi.fn().mockResolvedValue(okResponse([])),
        put: vi.fn().mockResolvedValue(okResponse({})),
        delete: vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
        patch: vi.fn(),
        raw: vi.fn(),
        request: vi.fn(),
        baseUrl: "https://gw.test",
    } as unknown as HttpClient & { post: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
}

describe("PoliciesResource", () => {
    let policies: PoliciesResource;
    let http: ReturnType<typeof createMockHttp>;

    beforeEach(() => {
        http = createMockHttp();
        policies = new PoliciesResource(http);
    });

    it("create sends policy with rules", async () => {
        http.post.mockResolvedValueOnce(okResponse({ id: "pol_1", name: "no-gpt4" }));
        const result = await policies.create({
            name: "no-gpt4",
            rules: [{ when: { model: "gpt-4" }, then: { action: "deny" } }],
            mode: "enforce",
        });
        expect(http.post).toHaveBeenCalledWith("/api/v1/policies", expect.objectContaining({
            name: "no-gpt4",
            rules: [{ when: { model: "gpt-4" }, then: { action: "deny" } }],
            mode: "enforce",
        }));
        expect(result.id).toBe("pol_1");
    });

    it("list returns policies", async () => {
        http.get.mockResolvedValueOnce(okResponse([{ id: "pol_1" }]));
        const result = await policies.list({ limit: 5 });
        expect(result).toHaveLength(1);
    });

    it("get retrieves a single policy", async () => {
        http.get.mockResolvedValueOnce(okResponse({ id: "pol_1", name: "test" }));
        const result = await policies.get("pol_1");
        expect(result.name).toBe("test");
    });

    it("update sends partial updates", async () => {
        http.put.mockResolvedValueOnce(okResponse({ updated: true }));
        await policies.update("pol_1", { name: "renamed" });
        expect(http.put).toHaveBeenCalledWith("/api/v1/policies/pol_1", { name: "renamed" });
    });

    it("delete calls DELETE", async () => {
        await policies.delete("pol_1");
        expect(http.delete).toHaveBeenCalledWith("/api/v1/policies/pol_1");
    });
});
