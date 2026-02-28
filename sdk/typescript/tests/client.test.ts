import { describe, it, expect, vi, beforeEach } from "vitest";
import { AILinkClient, ScopedClient } from "../src/client.js";

describe("AILinkClient", () => {
    it("creates client with defaults from options", () => {
        const client = new AILinkClient({
            apiKey: "ailink_v1_test",
            gatewayUrl: "https://gw.test",
        });
        expect(client.apiKey).toBe("ailink_v1_test");
        expect(client.gatewayUrl).toBe("https://gw.test");
    });

    it("strips trailing slashes from gateway URL", () => {
        const client = new AILinkClient({ gatewayUrl: "https://gw.test///" });
        expect(client.gatewayUrl).toBe("https://gw.test");
    });

    it("falls back to env vars or default", () => {
        const client = new AILinkClient({});
        expect(client.gatewayUrl).toBe("http://localhost:8443");
    });

    it("admin() creates a client with admin auth", () => {
        const admin = AILinkClient.admin({ adminKey: "admin_secret", gatewayUrl: "https://gw.test" });
        expect(admin.apiKey).toBe("admin_secret");
        expect(admin.gatewayUrl).toBe("https://gw.test");
    });

    // ── Lazy resource accessors ──────────────────────────────────────────

    it("exposes lazy resource accessors", () => {
        const client = new AILinkClient({ apiKey: "test" });
        expect(client.tokens).toBeDefined();
        expect(client.credentials).toBeDefined();
        expect(client.policies).toBeDefined();
        expect(client.approvals).toBeDefined();
        expect(client.audit).toBeDefined();
        expect(client.services).toBeDefined();
        expect(client.apiKeys).toBeDefined();
        expect(client.webhooks).toBeDefined();
        expect(client.guardrails).toBeDefined();
        expect(client.modelAliases).toBeDefined();
        expect(client.analytics).toBeDefined();
        expect(client.config).toBeDefined();
        expect(client.batches).toBeDefined();
        expect(client.fineTuning).toBeDefined();
        expect(client.realtime).toBeDefined();
        expect(client.billing).toBeDefined();
        expect(client.projects).toBeDefined();
        expect(client.experiments).toBeDefined();
    });

    it("returns same resource instance on repeated access (cached)", () => {
        const client = new AILinkClient({ apiKey: "test" });
        const tokens1 = client.tokens;
        const tokens2 = client.tokens;
        expect(tokens1).toBe(tokens2);
    });

    // ── Scoped clients ──────────────────────────────────────────────────

    it("withUpstreamKey returns a ScopedClient", () => {
        const client = new AILinkClient({ apiKey: "test" });
        const byok = client.withUpstreamKey("sk-openai-key");
        expect(byok).toBeInstanceOf(ScopedClient);
    });

    it("trace returns a ScopedClient with session ID", () => {
        const client = new AILinkClient({ apiKey: "test" });
        const traced = client.trace({ sessionId: "agent-42" });
        expect(traced).toBeInstanceOf(ScopedClient);
    });

    it("trace generates UUID when no sessionId provided", () => {
        const client = new AILinkClient({ apiKey: "test" });
        const traced = client.trace();
        expect(traced).toBeInstanceOf(ScopedClient);
    });

    it("withGuardrails returns a ScopedClient", () => {
        const client = new AILinkClient({ apiKey: "test" });
        const guarded = client.withGuardrails(["pii_redaction"]);
        expect(guarded).toBeInstanceOf(ScopedClient);
    });

    it("withGuardrails with empty array returns a no-op ScopedClient", () => {
        const client = new AILinkClient({ apiKey: "test" });
        const guarded = client.withGuardrails([]);
        expect(guarded).toBeInstanceOf(ScopedClient);
    });

    // ── Health check ───────────────────────────────────────────────────

    it("isHealthy returns true on 200", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("ok", { status: 200 })));
        const client = new AILinkClient({ apiKey: "test" });
        expect(await client.isHealthy()).toBe(true);
    });

    it("isHealthy returns false on network error", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("network error")));
        const client = new AILinkClient({ apiKey: "test" });
        expect(await client.isHealthy()).toBe(false);
    });

    it("isHealthy returns false on 500", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("fail", { status: 500 })));
        const client = new AILinkClient({ apiKey: "test" });
        expect(await client.isHealthy()).toBe(false);
    });

    it("health returns status object on success", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("ok", { status: 200 })));
        const client = new AILinkClient({ apiKey: "test", gatewayUrl: "https://gw.test" });
        const result = await client.health();
        expect(result.status).toBe("ok");
        expect(result.gatewayUrl).toBe("https://gw.test");
        expect(result.httpStatus).toBe(200);
    });

    // ── Experiments stub ───────────────────────────────────────────────

    it("experiments methods throw NotImplementedError", async () => {
        const client = new AILinkClient({ apiKey: "test" });
        await expect(client.experiments.create("test", [])).rejects.toThrow();
        await expect(client.experiments.list()).rejects.toThrow();
        await expect(client.experiments.results("id")).rejects.toThrow();
        await expect(client.experiments.stop("id")).rejects.toThrow();
    });
});
