import { connection } from "next/server";
import { moneyService, webhookResponse } from "@/server/money";

/**
 * Where the payment gateway reports a payment (see src/server/money.ts).
 * The raw body is verified against the gateway's signature before anything
 * in it is trusted, each event is acted on once (a replay answers 200 and
 * changes nothing), and the answer never says more than OK, Bad request or,
 * with no gateway set up, Not found.
 */
export async function POST(request: Request): Promise<Response> {
  // Never at build time: it changes the database.
  await connection();
  return webhookResponse(request, (rawBody, headers) => moneyService().handleWebhook(rawBody, headers));
}
