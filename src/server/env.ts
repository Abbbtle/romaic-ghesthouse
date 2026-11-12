import "server-only";
import path from "node:path";
import { z } from "zod";

/**
 * The environment, read and checked once, on first use rather than at
 * import, so `next build` never trips over a variable only the running site
 * needs. .env.example says what each one is for. An empty value counts as
 * unset, as in .env.example itself.
 *
 * Getters for variables production needs throw a clear error the first
 * time they're used without one, naming the variable and why.
 */

const optionalText = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined);

const poolSize = "a whole number from 1 to 50";

const variablesSchema = z.object({
  NODE_ENV: optionalText,
  NEXT_PHASE: optionalText,
  VERCEL: optionalText,
  // Set by Vercel on every deployment: the production domain, without https://.
  VERCEL_PROJECT_PRODUCTION_URL: optionalText,
  NEXT_PUBLIC_SITE_URL: optionalText.pipe(z.url({ error: "a full address like https://www.romaicguesthouse.co.za" }).optional()),
  DATABASE_URL: optionalText,
  POSTGRES_URL: optionalText,
  DATABASE_URL_UNPOOLED: optionalText,
  POSTGRES_URL_NON_POOLING: optionalText,
  // Typed as coercing a string: optionalText has already turned "" into undefined, which .optional() lets through.
  DATABASE_POOL_MAX: optionalText.pipe(z.coerce.number<string>({ error: poolSize }).int(poolSize).min(1, poolSize).max(50, poolSize).optional()),
  DATABASE_CA_CERT: optionalText,
  PGLITE_DATA_DIR: optionalText,
  DATA_ENCRYPTION_KEY: optionalText,
  ADMIN_HOST: optionalText.pipe(
    z
      .string()
      .regex(/^[a-z0-9.-]+(:\d+)?$/, { error: "a host name like admin.romaicguesthouse.co.za, without https://" })
      .optional(),
  ),
  ADMIN_SETUP_TOKEN: optionalText,
  VISITOR_KEY_SECRET: optionalText,
  CLIENT_IP_HEADER: optionalText,
  RESEND_API_KEY: optionalText,
  NOTIFY_FROM_EMAIL: optionalText,
  CRON_SECRET: optionalText,
  DESIGN_PREVIEW: optionalText,
});

type Variables = z.output<typeof variablesSchema>;

/** Where Resend stands: ready to send, not set up, or half set up (which is worth saying out loud). */
export type ResendSettings =
  | { status: "configured"; apiKey: string; from: string }
  | { status: "missing" }
  | { status: "partial"; missing: string };

/** The environment's getters over `source` (process.env in the app; anything in tests). */
export function createServerEnv(source: Readonly<Record<string, string | undefined>>) {
  let parsed: Variables | null = null;
  const variables = (): Variables => {
    if (parsed) return parsed;
    const result = variablesSchema.safeParse(source);
    if (!result.success) {
      const problems = result.error.issues.map((issue) => `${issue.path.join(".")} (expected ${issue.message})`);
      throw new Error(`Check these environment variables: ${problems.join(", ")}.`);
    }
    parsed = result.data;
    return parsed;
  };

  const onVercel = () => Boolean(variables().VERCEL);

  return {
    /** A production build or server: `next build`, `next start`, Vercel. */
    isProduction: () => variables().NODE_ENV === "production",

    /**
     * A client preview deployment (DESIGN_PREVIEW=1, set at build time): the
     * /kit design preview is served in production and the home page points to
     * it, until the real pages are built.
     */
    isDesignPreview: () => variables().DESIGN_PREVIEW === "1",

    /** Running on Vercel, where many servers run at once and none has a disk to keep. */
    onVercel,

    /** `next build` is running: nothing may open the database then. */
    isBuilding: () => variables().NEXT_PHASE === "phase-production-build",

    /** The public address, for canonical links, the sitemap and social previews. */
    siteUrl: () => {
      const { NEXT_PUBLIC_SITE_URL: configured, VERCEL_PROJECT_PRODUCTION_URL: vercelDomain } = variables();
      // Never localhost on Vercel: canonical links, the sitemap and social previews would point at it.
      return configured ?? (vercelDomain ? `https://${vercelDomain}` : "http://localhost:3000");
    },

    /** The connection the site uses (Supabase's transaction pooler): DATABASE_URL, or the integration's POSTGRES_URL. Null means PGlite. */
    databaseUrl: () => variables().DATABASE_URL ?? variables().POSTGRES_URL ?? null,

    /**
     * The connection scripts use (migrations, password resets), preferring a
     * direct one: DATABASE_URL_UNPOOLED, then the integration's
     * POSTGRES_URL_NON_POOLING, then the site's own connection (databaseUrl).
     * Null means PGlite.
     */
    scriptDatabaseUrl: () => {
      const { DATABASE_URL_UNPOOLED, POSTGRES_URL_NON_POOLING, DATABASE_URL, POSTGRES_URL } = variables();
      return DATABASE_URL_UNPOOLED ?? POSTGRES_URL_NON_POOLING ?? DATABASE_URL ?? POSTGRES_URL ?? null;
    },

    /** Connections one server instance may hold. Supabase's free tier allows 60 in all. */
    databasePoolMax: () => variables().DATABASE_POOL_MAX ?? 3,

    /**
     * A root certificate (PEM) for a database whose CA is private and isn't
     * Supabase's. A PEM pasted on one line with "\n" for each line break
     * reads as the PEM it stands for.
     */
    databaseCaCertificate: () => variables().DATABASE_CA_CERT?.replaceAll("\\n", "\n") ?? null,

    /**
     * Where PGlite keeps the development database, as an absolute path. The
     * ignore comment stops the bundler tracing the whole project into the
     * server output because of this runtime path (PGlite never runs on Vercel).
     */
    pgliteDataDir: () => path.resolve(/*turbopackIgnore: true*/ variables().PGLITE_DATA_DIR ?? "./data.nosync/pglite"),

    /** Asked for when creating the first owner. Production without one keeps setup locked. */
    adminSetupToken: () => variables().ADMIN_SETUP_TOKEN ?? null,

    /**
     * What visitors' IP addresses are hashed with, and signed tokens signed
     * with. Required on Vercel, whose servers must all count the same way;
     * elsewhere, null means one random secret per process.
     */
    visitorKeySecret: (): string | null => {
      const secret = variables().VISITOR_KEY_SECRET;
      if (secret) return secret;
      if (onVercel()) {
        throw new Error("Set VISITOR_KEY_SECRET to a long random string: Vercel runs many servers, and each would otherwise count visitors on its own.");
      }
      return null;
    },

    /** The request header holding the visitor's IP address, in lower case (see ./visitor.ts). */
    clientIpHeader: () => (variables().CLIENT_IP_HEADER ?? "x-forwarded-for").toLowerCase(),

    /** Resend's settings for email alerts. */
    resend: (): ResendSettings => {
      const { RESEND_API_KEY: apiKey, NOTIFY_FROM_EMAIL: from } = variables();
      if (apiKey && from) return { status: "configured", apiKey, from };
      if (!apiKey && !from) return { status: "missing" };
      return { status: "partial", missing: apiKey ? "NOTIFY_FROM_EMAIL" : "RESEND_API_KEY" };
    },

    /** The bearer token Vercel Cron sends to /api/cron/daily. Null means the route refuses every call in production (development runs the job without one). */
    cronSecret: () => variables().CRON_SECRET ?? null,

    /**
     * The keys that encrypt values at rest (authenticator secrets, later channel
     * links and API keys): "k1:<base64 32 bytes>", newest first, comma-separated
     * (src/adapters/crypto/field-encryption.ts). Required in production. In
     * development without one, a fixed key that is NOT secret is used, so local
     * authenticator setups survive restarts; never use it anywhere real.
     */
    dataEncryptionKeys: (): string => {
      const keys = variables().DATA_ENCRYPTION_KEY;
      if (keys) return keys;
      if (variables().NODE_ENV === "production" || onVercel()) {
        throw new Error('Set DATA_ENCRYPTION_KEY to "k1:" followed by 32 random bytes in base64 (see .env.example).');
      }
      return developmentDataKey;
    },

    /**
     * The host the dashboard is served from, such as admin.romaicguesthouse.co.za
     * (threat model D1), or null to serve it under /admin on the site's own host.
     * With a host set, the public host answers 404 for /admin.
     */
    adminHost: () => variables().ADMIN_HOST ?? null,
  };
}

export type ServerEnv = ReturnType<typeof createServerEnv>;

/**
 * For scripts, which Next.js doesn't start: reads .env.local, then .env,
 * when they exist, the way `next dev` does. Variables already set (in the
 * shell, say) win. Call it before anything reads the environment.
 */
export function loadEnvFiles(directory = process.cwd()): void {
  for (const file of [".env.local", ".env"]) {
    try {
      // Scripts only: the ignore comment keeps the bundler from tracing the whole project for this path.
      process.loadEnvFile(path.join(/*turbopackIgnore: true*/ directory, file));
    } catch (error) {
      // A missing file is fine; anything else (a malformed one) isn't.
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
}

/**
 * Development only, and public: lets local authenticator secrets survive restarts without
 * configuring a key. The server refuses to use it in production.
 */
const developmentDataKey = "dev:ZGV2ZWxvcG1lbnQta2V5LW5vdC1zZWNyZXQtMzJieXQ=";

/** This server's environment. process.env is read on first use, then kept. */
export const env: ServerEnv = createServerEnv(process.env);
