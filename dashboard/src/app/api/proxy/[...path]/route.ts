
import { NextRequest, NextResponse } from "next/server";

const GATEWAY_URL = process.env.GATEWAY_INTERNAL_URL || process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:8443";
const ADMIN_KEY = process.env.AILINK_ADMIN_KEY;

async function proxyHandler(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
    const path = (await params).path.join("/");
    const url = `${GATEWAY_URL}/api/v1/${path}`;
    const searchParams = req.nextUrl.searchParams.toString();
    const finalUrl = searchParams ? `${url}?${searchParams}` : url;

    if (!ADMIN_KEY) {
        return NextResponse.json(
            { error: "Server misconfiguration: AILINK_ADMIN_KEY not set" },
            { status: 500 }
        );
    }

    try {
        const headers = new Headers(req.headers);
        headers.delete("host");
        headers.delete("connection");
        // Inject Admin Key
        headers.set("X-Admin-Key", ADMIN_KEY);

        // Forward the request
        const upstreamRes = await fetch(finalUrl, {
            method: req.method,
            headers,
            body: req.body,
            // @ts-ignore: duplex is needed for streaming bodies in some node versions/fetch implementations
            duplex: "half",
        });

        const body = upstreamRes.body;

        return new NextResponse(body, {
            status: upstreamRes.status,
            statusText: upstreamRes.statusText,
            headers: upstreamRes.headers,
        });
    } catch (error) {
        console.error("Proxy error:", error);
        return NextResponse.json(
            { error: "Failed to forward request to gateway" },
            { status: 502 }
        );
    }
}

export const GET = proxyHandler;
export const POST = proxyHandler;
export const PUT = proxyHandler;
export const DELETE = proxyHandler;
export const PATCH = proxyHandler;
