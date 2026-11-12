import { isPublicAdminPath, signInPath } from "./admin-paths";

/**
 * What the proxy (src/proxy.ts) decides for a request to /admin, as a plain
 * function of the request, so it can be tested without Next.js. Kept free of
 * server-only imports, like everything the proxy uses.
 *
 * It only looks for the session cookie, never at the database: every page,
 * action and route handler still checks the session itself.
 */

/** The parts of a request the decision depends on. */
export type AdminRequest = {
  method: string;
  pathname: string;
  searchParams: URLSearchParams;
  /** Whether the dashboard's session cookie came with it (whatever its value; pages check that). */
  hasSessionCookie: boolean;
};

export type AdminGateDecision =
  /** Send them to sign in first (a redirect to `location`, which brings them back afterwards). */
  | { action: "sign-in"; location: string }
  /** Let the request through, telling the page which path was asked for (for its own redirect to sign in, should the session turn out to be gone). */
  | { action: "continue"; requestedPath: string };

/**
 * - A page load (GET or HEAD) of a dashboard page without the cookie goes
 *   to sign in, with ?next= so it comes back.
 * - The pages that create a session or work from an emailed link, the APIs
 *   (which answer 401 themselves) and the web-app manifest are open.
 * - Anything else (server actions POST to the page they're on) goes
 *   through untouched: actions check the session themselves and say so when
 *   it's gone, and a redirect here would replay the post.
 */
export function adminGate(request: AdminRequest): AdminGateDecision {
  const isPageLoad = request.method === "GET" || request.method === "HEAD";
  const isDashboardPage = isPageLoad && !isPublicAdminPath(request.pathname);
  const requestedPath = pathAndQuery(request.pathname, request.searchParams);
  if (isDashboardPage && !request.hasSessionCookie) return { action: "sign-in", location: signInPath(requestedPath) };
  return { action: "continue", requestedPath };
}

/** The path and query someone asked for, without the router's own cache-busting parameter or a reset token. */
function pathAndQuery(pathname: string, searchParams: URLSearchParams): string {
  const query = new URLSearchParams(searchParams);
  query.delete("_rsc");
  query.delete("token");
  return query.size > 0 ? `${pathname}?${query}` : pathname;
}
