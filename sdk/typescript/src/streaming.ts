/**
 * SSE (Server-Sent Events) stream parser that converts a `ReadableStream`
 * from a `fetch` response into a typed `AsyncIterable`.
 *
 * @example
 * ```ts
 * const response = await fetch(url);
 * for await (const event of streamSSE<ChatChunk>(response)) {
 *   process.stdout.write(event.choices[0].delta.content ?? "");
 * }
 * ```
 *
 * @module
 */

/**
 * Parse an SSE response body into an `AsyncIterable` of parsed JSON events.
 *
 * Handles the `data: [DONE]` sentinel used by OpenAI-compatible APIs.
 *
 * @param response - A `fetch` `Response` with `Content-Type: text/event-stream`.
 * @returns An async iterable yielding parsed event objects of type `T`.
 */
export async function* streamSSE<T>(response: Response): AsyncIterable<T> {
    const body = response.body;
    if (!body) return;

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            // Keep the last incomplete line in the buffer
            buffer = lines.pop() ?? "";

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith(":")) continue; // comment or empty
                if (trimmed.startsWith("data: ")) {
                    const data = trimmed.slice(6);
                    if (data === "[DONE]") return;
                    try {
                        yield JSON.parse(data) as T;
                    } catch {
                        // Skip malformed JSON lines
                    }
                }
            }
        }

        // Process any remaining data in the buffer
        if (buffer.trim()) {
            const trimmed = buffer.trim();
            if (trimmed.startsWith("data: ")) {
                const data = trimmed.slice(6);
                if (data !== "[DONE]") {
                    try {
                        yield JSON.parse(data) as T;
                    } catch {
                        // Skip malformed JSON
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}
