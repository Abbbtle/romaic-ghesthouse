import type { Role } from "@/lib/kernel/actor";
import type { Clock } from "@/lib/kernel/ports";
import type { AccountStore, SecretGenerator, Session, SessionStore, TokenHasher } from "./ports";

/**
 * How long a dashboard session lasts (docs/planning/roles.md, decision R6).
 * A session ends at whichever comes first:
 * - its idle limit, which moves on while it's used;
 * - its absolute limit, fixed at sign-in, after which the person signs in
 *   again whatever they're doing.
 * Admins (agency staff on computers, who can change the site) get the
 * shortest sessions. Staff may share a phone, so theirs idle out sooner.
 */
export const sessionPolicies: Record<Role, { idleMs: number; absoluteMs: number }> = {
  owner: { idleMs: 24 * hour(), absoluteMs: 7 * day() },
  sales: { idleMs: 24 * hour(), absoluteMs: 7 * day() },
  staff: { idleMs: 12 * hour(), absoluteMs: 7 * day() },
  admin: { idleMs: 2 * hour(), absoluteMs: 24 * hour() },
};

function hour(): number {
  return 60 * 60 * 1000;
}

function day(): number {
  return 24 * hour();
}

/** A browser that has just signed in: the token goes in its cookie, which expires with the session's absolute limit. */
export type NewSession = { token: string; expiresAt: Date };

/** Whether a session has ended at `now`. */
export function sessionEnded(session: Pick<Session, "idleExpiresAt" | "absoluteExpiresAt">, now: Date): boolean {
  return session.idleExpiresAt.getTime() <= now.getTime() || session.absoluteExpiresAt.getTime() <= now.getTime();
}

/**
 * The idle extension a session in use is due, or null when it was extended
 * recently. Writes are spaced to a tenth of the idle limit, so a busy
 * dashboard doesn't write on every request; the extension never passes the
 * absolute limit.
 */
export function sessionRenewal(session: Pick<Session, "lastExtendedAt" | "absoluteExpiresAt">, role: Role, now: Date): { idleExpiresAt: Date; unlessExtendedSince: Date } | null {
  const { idleMs } = sessionPolicies[role];
  const spacing = idleMs / 10;
  if (now.getTime() - session.lastExtendedAt.getTime() < spacing) return null;
  const idleExpiresAt = new Date(Math.min(now.getTime() + idleMs, session.absoluteExpiresAt.getTime()));
  return { idleExpiresAt, unlessExtendedSince: new Date(now.getTime() - spacing) };
}

// Session tokens are 32 random bytes, base64url-encoded (see SecretGenerator.sessionToken).
const sessionTokenPattern = /^[A-Za-z0-9_-]{43}$/;

/** Whether a cookie's value could be a session token at all, so junk never reaches the database. */
export function isSessionToken(value: string): boolean {
  return sessionTokenPattern.test(value);
}

/** A session's public handle for the session list: enough to tell sessions apart, never enough to use one. */
export function sessionHandle(tokenHash: string): string {
  return tokenHash.slice(0, 16);
}

export type SessionStartDependencies = {
  accounts: Pick<AccountStore, "recordSignIn">;
  sessions: Pick<SessionStore, "create">;
  secrets: Pick<SecretGenerator, "sessionToken">;
  tokens: Pick<TokenHasher, "hash">;
  clock: Clock;
};

/**
 * Signs an account in on this browser: stores a hash of a new token and
 * returns the token for the cookie. A new token every time (never a session
 * carried over from before sign-in), so a planted cookie can't be promoted.
 */
export async function startSession(
  deps: SessionStartDependencies,
  account: { id: string; role: Role },
  options: { mfaVerified: boolean; device: string; absoluteExpiresAt?: Date },
): Promise<NewSession> {
  const token = deps.secrets.sessionToken();
  const now = deps.clock.now();
  const policy = sessionPolicies[account.role];
  const absoluteExpiresAt = options.absoluteExpiresAt ?? new Date(now.getTime() + policy.absoluteMs);
  const idleExpiresAt = new Date(Math.min(now.getTime() + policy.idleMs, absoluteExpiresAt.getTime()));
  await deps.sessions.create({
    tokenHash: deps.tokens.hash(token),
    accountId: account.id,
    createdAt: now,
    idleExpiresAt,
    absoluteExpiresAt,
    lastExtendedAt: now,
    mfaVerifiedAt: options.mfaVerified ? now : null,
    stepUpAt: options.mfaVerified ? now : null,
    device: options.device.slice(0, 80),
  });
  await deps.accounts.recordSignIn(account.id, now);
  return { token, expiresAt: absoluteExpiresAt };
}

/** A short, human description of a browser from its User-Agent header, for the session list. */
export function describeDevice(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "A browser";
  const system = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X|Macintosh/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : "";
  return system ? `${browser} on ${system}` : browser;
}
