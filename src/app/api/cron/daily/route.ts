import { connection, type NextRequest } from "next/server";
import { cronResponse } from "@/server/cron-endpoint";
import { runDailyMaintenance } from "@/server/daily-maintenance";
import { env } from "@/server/env";

/** The daily job, called by Vercel Cron with the CRON_SECRET bearer token (see src/server/cron-endpoint.ts). */
export async function GET(request: NextRequest): Promise<Response> {
  // Never at build time: it changes the database.
  await connection();
  return cronResponse(request, { secret: env.cronSecret(), production: env.isProduction() }, runDailyMaintenance);
}
