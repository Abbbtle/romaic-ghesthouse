/**
 * The dashboard's own addresses, for redirects. Kept free of server-only
 * imports, so the proxy can use them too.
 */
export const adminPaths = {
  home: "/admin",
  signIn: "/admin/sign-in",
  setup: "/admin/setup",
  changePassword: "/admin/change-password",
  /** The authenticator step of signing in. */
  mfa: "/admin/mfa",
  /** Setting up an authenticator, for roles that need one. */
  mfaSetup: "/admin/mfa/setup",
  /** Re-entering the password and code before a sensitive change. */
  stepUp: "/admin/confirm",
  /** Owners only: ask for a reset link by email. */
  forgotPassword: "/admin/forgot-password",
  /** Where a reset link lands. */
  resetPassword: "/admin/reset-password",
  /** Where an email verification link lands. */
  verifyEmail: "/admin/verify-email",
  /** The dashboard's JSON endpoints, such as /admin/api/pulse. They answer 401 themselves. */
  api: "/admin/api",
  /** The installable dashboard's web-app manifest, which browsers fetch without cookies. */
  manifest: "/admin/manifest.webmanifest",
} as const;

/**
 * The request header the proxy fills in with the path being asked for, so a
 * page that finds its session gone can send people to sign in and back. The
 * proxy always overwrites it, so a browser can't choose it.
 */
export const requestedPathHeader = "x-romaic-admin-path";

/** Whether `pathname` is `path` or something inside it. */
const isWithin = (pathname: string, path: string): boolean => pathname === path || pathname.startsWith(`${path}/`);

/** Pages anyone may open without a session cookie: they create one, or work from an emailed link. */
const publicPages: readonly string[] = [adminPaths.signIn, adminPaths.setup, adminPaths.forgotPassword, adminPaths.resetPassword, adminPaths.verifyEmail];

/**
 * The paths the proxy lets through without a session cookie: the pages
 * that create one, the web-app manifest and its icons (browsers fetch them
 * without cookies), and everything under the APIs.
 */
export function isPublicAdminPath(pathname: string): boolean {
  return publicPages.includes(pathname) || isWithin(pathname, adminPaths.manifest) || isWithin(pathname, adminPaths.api);
}

/** Pages a signed-in person can't be sent back to: the sign-in steps (they'd bounce), the link pages and the APIs (they're JSON). */
const notDestinations = [
  adminPaths.signIn,
  adminPaths.setup,
  adminPaths.mfa,
  adminPaths.changePassword,
  adminPaths.forgotPassword,
  adminPaths.resetPassword,
  adminPaths.verifyEmail,
  adminPaths.stepUp,
  adminPaths.api,
];

// No other site's address, no "//host" or "\" tricks, no control characters.
const unsafe = /[\\\u0000-\u001f\u007f]/;

/**
 * Where to go after signing in: `value` when it's a dashboard page on this
 * site, otherwise the dashboard's home. The sign-in page takes it from its
 * ?next= parameter, which anyone can write into a link, so it must never
 * send people to another site.
 */
export function safeAdminDestination(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || unsafe.test(value)) return adminPaths.home;
  let url: URL;
  try {
    url = new URL(value, "https://romaic.invalid");
  } catch {
    return adminPaths.home;
  }
  const { origin, pathname, search, hash } = url;
  const excluded = notDestinations.some((path) => isWithin(pathname, path));
  return origin === "https://romaic.invalid" && isWithin(pathname, adminPaths.home) && !excluded ? `${pathname}${search}${hash}` : adminPaths.home;
}

/** The sign-in page, asking to come back to `destination` afterwards (unless that's the dashboard's home anyway). */
export function signInPath(destination: unknown): string {
  const next = safeAdminDestination(destination);
  return next === adminPaths.home ? adminPaths.signIn : `${adminPaths.signIn}?${new URLSearchParams({ next })}`;
}
