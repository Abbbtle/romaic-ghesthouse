/**
 * The dashboard's session cookie. Kept free of server-only imports so the
 * proxy can use it too.
 *
 * In production it's a `__Host-` cookie: Secure, Path=/ and no Domain, so a
 * neighbouring subdomain can't set or overwrite it (threat model T04, D1).
 * A path scope like /admin is no security boundary on one origin, so the
 * cookie isn't scoped by path; the dashboard can live on its own host
 * (ADMIN_HOST) to isolate it from the public site instead.
 *
 * httpOnly keeps it out of scripts' reach; SameSite=Lax keeps it off
 * cross-site form posts (server actions also check the request's origin).
 * It expires with the session's absolute limit; the database decides
 * whether the session is still live on every request.
 */
export function sessionCookieName(production = process.env.NODE_ENV === "production"): string {
  return production ? "__Host-romaic_session" : "romaic_session";
}

export const sessionCookie = {
  get name() {
    return sessionCookieName();
  },
  path: "/",
} as const;

/** What every write of the cookie shares, setting or clearing it, so the two can't drift apart. */
function baseCookieOptions(production: boolean) {
  return { httpOnly: true, secure: production, sameSite: "lax", path: sessionCookie.path } as const;
}

export function sessionCookieOptions(expiresAt: Date, production = process.env.NODE_ENV === "production") {
  return { ...baseCookieOptions(production), expires: expiresAt } as const;
}

/** Options that delete the cookie: the same attributes, already expired. */
export function clearedSessionCookieOptions(production = process.env.NODE_ENV === "production") {
  return { ...baseCookieOptions(production), maxAge: 0 } as const;
}
