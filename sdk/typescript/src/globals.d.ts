/**
 * Global type declarations for web APIs available in Node 18+, Deno, Bun,
 * Cloudflare Workers, and all modern browsers.
 *
 * We don't include the full DOM lib because we only need a few APIs.
 */

// ── Crypto API (Node 18+, Deno, Bun, Workers, browsers) ──────────────────
declare const crypto: {
    randomUUID(): string;
    getRandomValues<T extends ArrayBufferView>(array: T): T;
};

// ── WebSocket (not always globally available — Node needs ws or undici) ────
// We declare a minimal interface; users in Node may need to polyfill.
interface WebSocketEventMap {
    open: Event;
    message: MessageEvent;
    error: Event;
    close: Event;
}

declare class WebSocket {
    static readonly OPEN: number;
    readonly readyState: number;

    constructor(url: string | URL, protocols?: string | string[]);

    send(data: string | ArrayBuffer): void;
    close(code?: number, reason?: string): void;

    addEventListener<K extends keyof WebSocketEventMap>(type: K, listener: (event: WebSocketEventMap[K]) => void): void;
    removeEventListener<K extends keyof WebSocketEventMap>(type: K, listener: (event: WebSocketEventMap[K]) => void): void;
}

interface MessageEvent {
    data: unknown;
}

interface Event {
    type: string;
}
