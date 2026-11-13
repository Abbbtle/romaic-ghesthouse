import "server-only";
import { randomBytes } from "node:crypto";
import { after } from "next/server";
import { createFieldCipher, parseDataKeys } from "@/adapters/crypto/field-encryption";
import { createTokenSigner, createVisitorKeys, type TokenSigner, type VisitorKeys } from "@/adapters/crypto/hmac";
import { randomIds } from "@/adapters/crypto/tokens";
import { createConsoleSender } from "@/adapters/email/console-sender";
import { createResendSender } from "@/adapters/email/resend-sender";
import { openDatabase, type Database } from "@/adapters/postgres/database";
import type { PostgresDriver } from "@/adapters/postgres/driver";
import { migrations } from "@/adapters/postgres/migrations/registry";
import { createPgDriver, createPgPool } from "@/adapters/postgres/pg-driver";
import { createPgliteDriver, sharedPglite } from "@/adapters/postgres/pglite-driver";
import { createPostgresRateLimiter, deleteEndedRateLimitWindows } from "@/adapters/postgres/rate-limiter";
import type { RateLimit, RateLimiter } from "@/lib/kernel/rate-limit";
import type { EmailSender } from "@/lib/kernel/email";
import type { Clock, FieldCipher, IdGenerator } from "@/lib/kernel/ports";
import { env, type ServerEnv } from "./env";

/**
 * What every composition module in src/server shares: the database, the
 * clock, ids, rate limits, visitor keys, signed tokens, email, and work that
 * runs after the response. The only place that picks these adapters.
 *
 * - The database is Supabase through node-postgres when DATABASE_URL (or the
 *   integration's POSTGRES_URL) is set, otherwise PGlite in PGLITE_DATA_DIR
 *   (default ./data.nosync/pglite): fine for development, never on Vercel,
 *   whose functions have no disk.
 * - Every registered migration runs once per process, before the first
 *   statement (see src/adapters/postgres/migrations/registry.ts).
 */

/** The real clock. Cores take it as a port, so tests can fix the time. */
export const clock: Clock = { now: () => new Date() };

/** Random UUIDs for new records. */
export const ids: IdGenerator = randomIds;

/**
 * Something made once per server process and kept on globalThis, where
 * development reloads find it again instead of opening another connection.
 * If making it throws, nothing is kept and the next call tries again.
 */
export function processSingleton<T>(name: string, create: () => T): T {
  const key = Symbol.for(`romaic.${name}`);
  const holder = globalThis as typeof globalThis & Record<symbol, T | undefined>;
  return (holder[key] ??= create());
}

/** The app's database, opened on first use and kept for the process (see openAppDatabase). */
export function database(): Database {
  return processSingleton("database", () => openAppDatabase(env));
}

/**
 * Opens the app's database as `serverEnv` describes it: node-postgres when
 * there's a database URL, else PGlite on disk. It connects, and migrates,
 * on the first statement.
 *
 * A page that read it while prerendering would freeze its data into static
 * HTML and create a database on the build machine, so opening it during
 * `next build` fails the build instead: call `await connection()` (or read
 * cookies) first. On Vercel, whose functions have no disk, a database URL is
 * required.
 */
export function openAppDatabase(serverEnv: ServerEnv): Database {
  if (serverEnv.isBuilding()) {
    throw new Error(
      "The database was opened during `next build`. Call `await connection()` (or read cookies) before using it, so it's read per request.",
    );
  }
  return openDatabase(appDriver(serverEnv), { migrations });
}

function appDriver(serverEnv: ServerEnv): PostgresDriver {
  const connectionString = serverEnv.databaseUrl();
  if (connectionString) {
    return createPgDriver(
      createPgPool({
        connectionString,
        maxConnections: serverEnv.databasePoolMax(),
        caCertificate: serverEnv.databaseCaCertificate(),
        attachToVercelFunctions: serverEnv.onVercel(),
        onConnectionError: (error) => reportError("A database connection failed", error),
      }),
    );
  }
  if (serverEnv.onVercel()) {
    throw new Error("Set DATABASE_URL to Supabase's transaction pooler connection string: Vercel's functions have no disk to keep a database on.");
  }
  return createPgliteDriver(sharedPglite(serverEnv.pgliteDataDir()));
}

/**
 * A driver for scripts (migrations, password resets, demo data): a direct
 * connection when one is configured (see env.scriptDatabaseUrl), otherwise
 * the local PGlite, which `next dev` mustn't have open at the same time.
 * `target` names where it points, without credentials, for the script to say.
 */
export function scriptDriver(): { driver: PostgresDriver; target: string } {
  const connectionString = env.scriptDatabaseUrl();
  if (!connectionString) {
    const directory = env.pgliteDataDir();
    return { driver: createPgliteDriver(sharedPglite(directory)), target: `PGlite in ${directory}` };
  }
  const pool = createPgPool({
    connectionString,
    maxConnections: 1,
    caCertificate: env.databaseCaCertificate(),
    attachToVercelFunctions: false,
    onConnectionError: (error) => reportError("A database connection failed", error),
  });
  // createPgPool has checked it's a URL; only the host and database name are repeated.
  const { hostname, pathname } = new URL(connectionString);
  return { driver: createPgDriver(pool), target: `Postgres at ${hostname}${pathname}` };
}

/** A rate limit counted in the database, so every server shares one count. Each limit needs its own scope. */
export function rateLimiter(limit: RateLimit): RateLimiter {
  return createPostgresRateLimiter(database(), limit, clock);
}

/**
 * Forgets rate-limit windows that have ended, in every scope: for the daily
 * clean-up (/api/cron/daily). Safe to run any number of times. Returns how
 * many went.
 */
export function pruneRateLimits(): Promise<number> {
  return deleteEndedRateLimitWindows(database(), clock.now());
}

/**
 * The secret visitor keys and signed tokens use: VISITOR_KEY_SECRET, or on
 * a machine without one, a random secret for this process (counts and
 * tokens then last until a restart, which is fine in development).
 */
function sharedSecret(): string | Uint8Array {
  return env.visitorKeySecret() ?? processSingleton("random-secret", () => new Uint8Array(randomBytes(32)));
}

/** Rate-limit keys for visitors that never keep their IP addresses (see ./visitor.ts for which address). */
export function visitorKeys(): VisitorKeys {
  return processSingleton("visitor-keys", () => createVisitorKeys(sharedSecret()));
}

/**
 * Signed tokens for one purpose, such as "booking-form": the server hands a
 * value to the browser and can trust it when it comes back unchanged.
 */
export function signedTokens(purpose: string): TokenSigner {
  return processSingleton(`signed-tokens:${purpose}`, () => createTokenSigner(sharedSecret(), purpose));
}

/** How this server sends email, chosen once per process (see emailSenderFor). */
/** Encryption at rest for single values, with the keys in DATA_ENCRYPTION_KEY. */
export function fieldCipher(): FieldCipher {
  return processSingleton("field-cipher", () => createFieldCipher(parseDataKeys(env.dataEncryptionKeys())));
}

export function emailSender(): EmailSender | null {
  return processSingleton("email-sender", () => emailSenderFor(env));
}

/**
 * How email goes out: Resend when RESEND_API_KEY and NOTIFY_FROM_EMAIL are
 * set; the terminal in development without them; nothing (null) in
 * production without them, so the dashboard can say alerts aren't set up
 * instead of pretending they were sent.
 */
export function emailSenderFor(serverEnv: ServerEnv): EmailSender | null {
  const resend = serverEnv.resend();
  if (resend.status === "configured") return createResendSender({ apiKey: resend.apiKey, from: resend.from });
  if (resend.status === "partial") console.error(`[romaic] Email alerts are half set up: ${resend.missing} is missing.`);
  return serverEnv.isProduction() ? null : createConsoleSender();
}

/**
 * Runs `task` after the response has gone, such as an email alert, so a
 * slow mail server never keeps the visitor waiting. A failure is logged
 * (as `description`), never shown to anyone. Call it from a server action,
 * route handler or server component.
 */
export function runAfterResponse(task: () => Promise<unknown>, description = "A task after the response failed"): void {
  after(async () => {
    try {
      await task();
    } catch (error) {
      reportError(description, error);
    }
  });
}

/**
 * Logs an unexpected error without the personal data it might carry.
 * Database errors can quote the values a statement held (and PGlite's carry
 * its parameters), so for those only the SQLSTATE and the names of the
 * constraint and table are kept; other errors keep their message and stack.
 */
export function reportError(description: string, error: unknown): void {
  console.error(`[romaic] ${description}`, safeErrorSummary(error));
}

/**
 * Why something failed, in one line, for a script to tell whoever ran it:
 * the error's message, or each one's when several failed together (such as
 * a connection refused on both IPv6 and IPv4), or its code when it has no
 * message. Not for logs: messages can quote personal data (see reportError).
 */
export function failureReason(error: unknown): string {
  if (error instanceof AggregateError && error.errors.length > 0) return error.errors.map(failureReason).join("; ");
  if (error instanceof Error) return error.message || ("code" in error && typeof error.code === "string" ? error.code : error.name);
  return String(error);
}

/**
 * The parts of an error that are safe to log. Anything with a `code` (a
 * database error, or a Node.js one, whose message may quote the value it
 * choked on) keeps only names and codes.
 */
export function safeErrorSummary(error: unknown): Record<string, string> {
  if (typeof error !== "object" || error === null) return { error: typeof error };
  const fields = error as Record<string, unknown>;
  const text = (key: string) => {
    const value = fields[key];
    return typeof value === "string" ? value : undefined;
  };
  const summary: Record<string, string | undefined> = text("code")
    ? { name: text("name"), code: text("code"), constraint: text("constraint"), table: text("table"), routine: text("routine") }
    : { name: text("name"), message: text("message"), stack: text("stack") };
  return Object.fromEntries(Object.entries(summary).filter((entry): entry is [string, string] => entry[1] !== undefined));
}
