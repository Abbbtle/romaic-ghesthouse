import { NextResponse, type NextRequest, type ProxyConfig } from "next/server";
import { adminGate } from "./server/admin-gate";
import { requestedPathHeader } from "./server/admin-paths";
import { dashboardPolicy, newNonce } from "./server/content-security-policy";
import { sessionCookie } from "./server/session-cookie";

/**
 * The dashboard's front door. It sends page loads without a session cookie
 * to sign in, and gives every dashboard response a fresh CSP nonce (Next.js
 * reads it from the request's Content-Security-Policy header and puts it on
 * its own scripts). What it decides is in src/server/admin-gate.ts; this
 * only applies it. Pages, actions and route handlers still check the session
 * themselves: Server Functions are POSTs to the page and can skip this proxy
 * if a matcher changes (see the Next 16 proxy docs).
 */
export function proxy(request: NextRequest): NextResponse {
  // A client design preview has no database yet: show the dashboard preview instead.
  if (process.env.DESIGN_PREVIEW === "1") return NextResponse.redirect(new URL("/kit?view=admin", request.url));

  const token = request.cookies.get(sessionCookie.name)?.value;
  const decision = adminGate({
    method: request.method,
    pathname: request.nextUrl.pathname,
    searchParams: request.nextUrl.searchParams,
    hasSessionCookie: Boolean(token),
  });
  if (decision.action === "sign-in") return NextResponse.redirect(new URL(decision.location, request.url));

  const nonce = newNonce();
  const policy = dashboardPolicy(nonce);
  // Always set here, so a browser can never choose the path a page reads from it.
  const forwarded = new Headers(request.headers);
  forwarded.set(requestedPathHeader, decision.requestedPath);
  forwarded.set("x-nonce", nonce);
  forwarded.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: forwarded } });
  response.headers.set("Content-Security-Policy", policy);
  // Dashboard pages show private data: never keep them in a shared or back-forward cache.
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export const config: ProxyConfig = {
  // /admin and everything under it, except the web-app manifest and its icons (browsers fetch them
  // without cookies). The APIs pass through too, so their responses carry the policy; they answer
  // 401 themselves.
  matcher: ["/admin", "/admin/((?!manifest\\.webmanifest(?:/|$)).*)"],
};
