/**
 * Anthropic drop-in wrapper — point your existing Anthropic client at the AILink gateway.
 *
 * @example
 * ```ts
 * import { AILinkClient } from "@ailink/sdk";
 *
 * const client = new AILinkClient({ apiKey: "ailink_v1_..." });
 * const anthropic = client.anthropic();
 *
 * const msg = await anthropic.messages.create({
 *   model: "claude-sonnet-4-20250514",
 *   max_tokens: 1024,
 *   messages: [{ role: "user", content: "Hello!" }],
 * });
 * ```
 *
 * @module
 */

import { VERSION } from "./version.js";

/**
 * Create a configured Anthropic client that routes through the AILink gateway.
 *
 * Requires the `@anthropic-ai/sdk` package as a peer dependency.
 *
 * @param gatewayUrl - The AILink gateway URL.
 * @param apiKey - The AILink virtual token.
 * @returns A configured Anthropic client instance.
 */
export function createAnthropicClient(gatewayUrl: string, apiKey: string): AnthropicClientLike {
    let AnthropicClass: AnthropicConstructor;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        AnthropicClass = require("@anthropic-ai/sdk").default ?? require("@anthropic-ai/sdk");
    } catch {
        throw new Error(
            "The '@anthropic-ai/sdk' package is required to use client.anthropic(). " +
            "Install it with: npm install @anthropic-ai/sdk",
        );
    }

    return new AnthropicClass({
        apiKey,
        baseURL: `${gatewayUrl.replace(/\/+$/, "")}/anthropic`,
        defaultHeaders: {
            "X-AILink-SDK": `typescript/${VERSION}`,
        },
    });
}

interface AnthropicConstructor {
    new(opts: { apiKey: string; baseURL: string; defaultHeaders: Record<string, string> }): AnthropicClientLike;
}

/** Minimal type representing an Anthropic client. */
export interface AnthropicClientLike {
    messages: { create: (...args: unknown[]) => Promise<unknown> };
    [key: string]: unknown;
}
