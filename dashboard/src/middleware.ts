import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js middleware — runs on every request server-side.
 *
 * Sets the `dashboard_token` cookie automatically from the DASHBOARD_SECRET
 * env var so the browser includes it on every subsequent /api/proxy/* call.
 *
 * This means api.ts (client-side) never needs to know the secret — the cookie
 * is injected by the server and included automatically by the browser on
 * same-origin requests.
 */
export function middleware(request: NextRequest) {
    const response = NextResponse.next();

    // Only act on non-API routes (page loads). The cookie must be set before
    // the first API call, so we set it when the user loads any page.
    const secret = process.env.DASHBOARD_SECRET;
    if (!secret) return response;

    // If the cookie is not already set (or has changed), refresh it.
    const existing = request.cookies.get("dashboard_token")?.value;
    if (existing !== secret) {
        response.cookies.set("dashboard_token", secret, {
            httpOnly: true,
            sameSite: "strict",
            secure: process.env.NODE_ENV === "production" && !request.headers.get("host")?.startsWith("localhost"),
            path: "/",
            // Session cookie — expires when tab closes. Re-set on next page load.
            maxAge: 60 * 60 * 24, // 24h
        });
    }

    return response;
}

export const config = {
    // Run on all routes EXCEPT the proxy API itself (to avoid loop)
    matcher: ["/((?!api/proxy|_next/static|_next/image|favicon.ico).*)"],
};
