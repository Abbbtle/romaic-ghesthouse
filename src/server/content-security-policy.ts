/**
 * The site's Content Security Policies (threat model §7, build-plan "CSP
 * decision"). Free of server-only imports: next.config.ts and the proxy both
 * use it.
 *
 * - The dashboard gets a per-request nonce with 'strict-dynamic', set by the
 *   proxy (src/proxy.ts): no 'unsafe-inline' for scripts. Its pages render per
 *   request anyway, so nonces cost little there.
 * - Public pages keep their static, cacheable shells, so they get a fixed
 *   policy from next.config.ts. Next 16.4.2 writes its RSC payload as inline
 *   `self.__next_f.push(…)` scripts that experimental SRI doesn't hash
 *   (server/app-render/use-flight-response.js), so the public script-src
 *   still allows 'unsafe-inline' until the Phase 1 spike shows otherwise. This
 *   is accepted risk AR3: the public site renders no raw HTML from anyone and
 *   holds no session (the cookie is httpOnly).
 * - Everything else is strict everywhere: no other origins, no plugins, no
 *   framing, no <base> injection, forms post only here.
 */

const isDevelopment = () => process.env.NODE_ENV === "development";

/** Directives both policies share. */
function sharedDirectives(): string[] {
  return [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
  ];
}

/** The dashboard's policy for one response, around its nonce. */
export function dashboardPolicy(nonce: string): string {
  return [
    ...sharedDirectives(),
    // React needs eval in development only, to rebuild server error stacks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment() ? " 'unsafe-eval'" : ""}`,
    // Style attributes (React's style prop, GSAP) need 'unsafe-inline' on style-src-attr; <style> elements carry the nonce.
    `style-src 'self' 'nonce-${nonce}'${isDevelopment() ? " 'unsafe-inline'" : ""}`,
    "style-src-attr 'unsafe-inline'",
  ].join("; ");
}

/** The public pages' fixed policy. */
export function publicPolicy(): string {
  return [
    ...sharedDirectives(),
    `script-src 'self' 'unsafe-inline'${isDevelopment() ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
  ].join("; ");
}

/** A fresh nonce for one response: 128 random bits, base64. */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/** Headers every response carries, beside its policy. */
export function baseSecurityHeaders(production: boolean): { key: string; value: string }[] {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    // One year, subdomains included; only over HTTPS, so not on http://localhost.
    ...(production ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
  ];
}
