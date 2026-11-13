import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { MaintenanceSummary } from "./daily-maintenance";

/**
 * GET /api/cron/daily, which Vercel Cron calls once a day with
 * `Authorization: Bearer <CRON_SECRET>`. With a secret set, only a request
 * carrying it runs the job; without one, production refuses every call
 * (the job stays off until it's configured) while development lets anyone
 * on the machine run it. The job is idempotent, so a repeated call only
 * finds less to do. The answer is the job's summary, never cached: 200 when
 * every task finished, 500 when one failed (so the cron's log shows it).
 */

export type CronAccess = {
  /** CRON_SECRET, or null when it isn't set. */
  secret: string | null;
  production: boolean;
};

const noStore = { "Cache-Control": "no-store" };

export async function cronResponse(request: Request, access: CronAccess, runDaily: () => Promise<MaintenanceSummary>): Promise<Response> {
  if (access.secret === null) {
    if (access.production) {
      return Response.json({ error: "The daily job is off: set CRON_SECRET to turn it on." }, { status: 503, headers: noStore });
    }
  } else if (!carriesSecret(request.headers.get("authorization"), access.secret)) {
    return Response.json({ error: "This needs the cron secret." }, { status: 401, headers: { ...noStore, "WWW-Authenticate": "Bearer" } });
  }
  const summary = await runDaily();
  return Response.json(summary, { status: summary.ok ? 200 : 500, headers: noStore });
}

/** Whether the Authorization header is "Bearer <secret>", compared in constant time whatever its length. */
function carriesSecret(authorization: string | null, secret: string): boolean {
  const match = /^Bearer (.+)$/.exec(authorization ?? "");
  if (!match?.[1]) return false;
  const digest = (text: string) => createHash("sha256").update(text).digest();
  return timingSafeEqual(digest(match[1]), digest(secret));
}
