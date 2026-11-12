import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createTestGateway, signTestWebhook } from "@/adapters/payments/test-gateway";
import { createPostgresInventoryStore } from "@/adapters/postgres/inventory-store";
import { createPostgresMoneyStore } from "@/adapters/postgres/money-store";
import { createPostgresReservationStore } from "@/adapters/postgres/reservation-store";
import { assertCan, can } from "@/lib/accounts/access";
import { businessTimeZone } from "@/lib/format/zoned-time";
import type { Actor } from "@/lib/kernel/actor";
import { done, refusedWith, type ChangeResult } from "@/lib/kernel/result";
import type { BookingForMoney } from "@/lib/money/money";
import { createMoneyService, type MoneyService, type WebhookResult } from "@/lib/money/money-service";
import type { PaymentGateway } from "@/lib/money/ports";
import { dashboardOrigin } from "./accounts";
import { auditRecorder } from "./audit";
import { contentService } from "./content";
import { env } from "./env";
import { clock, database, ids, processSingleton } from "./infrastructure";

/**
 * Booking money as the dashboard and the webhook route use it: payments,
 * invoices and webhook events in Postgres; bookings, units and apartment
 * names read as they are now; permissions from the accounts core; every
 * change in the audit log under "money".
 *
 * The payment gateway. No real one is chosen yet (open question #11), so
 * the only adapter is the test one, and it never moves money:
 * - in development and tests it's on unless PAYMENT_GATEWAY=none, signing
 *   with TEST_GATEWAY_SECRET or, without one, a random secret made once per
 *   process (only this server can then sign its webhooks);
 * - in production it's off unless explicitly turned on with
 *   PAYMENT_GATEWAY=test and a TEST_GATEWAY_SECRET of at least 32
 *   characters. With it off the webhook route answers 404 and the money
 *   page says to record payments by hand.
 */

/** The shortest TEST_GATEWAY_SECRET used; a shorter one counts as not set. */
export const minimumTestSecretLength = 32;

export type GatewaySetting = { kind: "none" } | { kind: "test"; secret: string | null };

/** Which gateway the variables in `source` ask for (see above); a secret of null means a random one for this process. */
export function gatewaySettingFrom(source: Readonly<Record<string, string | undefined>>, production: boolean): GatewaySetting {
  const choice = (source.PAYMENT_GATEWAY ?? "").trim().toLowerCase();
  const configured = source.TEST_GATEWAY_SECRET?.trim() ?? "";
  const secret = configured.length >= minimumTestSecretLength ? configured : null;
  if (production) return choice === "test" && secret ? { kind: "test", secret } : { kind: "none" };
  return choice === "none" ? { kind: "none" } : { kind: "test", secret };
}

const gatewaySetting = () => gatewaySettingFrom(env.paymentGatewayVariables(), env.isProduction());

/** The test gateway's secret: the configured one, or one made for this process. */
function testSecret(setting: Extract<GatewaySetting, { kind: "test" }>): string {
  return setting.secret ?? processSingleton("test-gateway-secret", () => randomBytes(32).toString("hex"));
}

function paymentGateway(): PaymentGateway | null {
  const setting = gatewaySetting();
  return setting.kind === "test" ? createTestGateway({ secret: testSecret(setting), clock }) : null;
}

/** A booking's money page, where a payment link brings the guest back to (and, in test mode, where its checkout is acted out). */
export function moneyPath(bookingId: string): string {
  return `/admin/bookings/${encodeURIComponent(bookingId)}/money`;
}

/** A booking as its money needs it: the guest billed, the apartment's name from the content, the unit's from the inventory. */
async function bookingForMoney(id: string): Promise<BookingForMoney | null> {
  const db = database();
  const booking = await createPostgresReservationStore(db).booking(id);
  if (!booking) return null;
  const [unit, content] = await Promise.all([createPostgresInventoryStore(db).unit(booking.unitId), contentService().getAll()]);
  const apartment = content.apartments.items.find((item) => item.slug === booking.apartment);
  return {
    id: booking.id,
    ref: booking.ref,
    status: booking.status,
    apartmentName: apartment?.name ?? booking.apartment,
    unitName: unit?.name ?? "Unit",
    stay: booking.stay,
    adults: booking.adults,
    children: booking.children,
    totalCents: booking.totalCents,
    depositDueCents: booking.depositDueCents,
    guest: { name: booking.guest.name, phone: booking.guest.phone, email: booking.guest.email },
  };
}

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

let money: MoneyService | null = null;

/** Made on first use and kept per module, like the other services; the gateway is chosen then. */
export function moneyService(): MoneyService {
  money ??= createMoneyService({
    store: createPostgresMoneyStore(database()),
    bookings: { booking: bookingForMoney },
    gateway: paymentGateway(),
    sha256,
    returnUrlFor: (bookingId) => `${dashboardOrigin()}${moneyPath(bookingId)}`,
    clock,
    ids,
    audit: auditRecorder(),
    access: { can, assertCan },
    timeZone: businessTimeZone,
  });
  return money;
}

/**
 * Test mode only: acts out the gateway telling us a waiting online payment
 * was paid (or failed), by signing a webhook exactly as the test gateway
 * would and handing it to the same code the webhook route uses. Who did it
 * is audited, beside the payment itself.
 */
export async function simulateTestPayment(actor: Actor, bookingId: string, paymentId: string, outcome: "paid" | "failed"): Promise<ChangeResult<{ result: WebhookResult["status"] }>> {
  const setting = gatewaySetting();
  if (setting.kind !== "test") return refusedWith("Test payments only work while the test gateway is on.");
  const account = await moneyService().account(actor, bookingId);
  const payment = account?.payments.find((candidate) => candidate.id === paymentId);
  if (!account || !payment || payment.status !== "pending" || payment.method !== "gateway" || !payment.providerRef || payment.voidedAt) {
    return refusedWith("That payment link isn't waiting any more. Reload the page.");
  }
  const event = { id: `sim_${randomBytes(12).toString("hex")}`, providerRef: payment.providerRef, status: outcome, amountCents: payment.amountCents };
  const { rawBody, headers } = signTestWebhook(testSecret(setting), event, clock.now());
  const result = await moneyService().handleWebhook(rawBody, { get: (name) => headers[name.toLowerCase()] ?? null });
  await auditRecorder().record({
    actor,
    category: "money",
    action: "payment.test-simulated",
    target: { type: "payment", id: payment.id },
    summary: `Acted out a test ${outcome === "paid" ? "payment" : "failed payment"} on booking ${account.booking.ref} (no money moved)`,
  });
  return done({ result: result.status });
}

/** The most a webhook body may be; real gateways send a few kilobytes. */
export const webhookBodyLimit = 64 * 1024;

/** Reads a request's body as text, giving up (null) past `limit` bytes without reading the rest. */
export async function readBodyWithin(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done: finished, value } = await reader.read();
    if (finished) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}

const webhookStatus: Record<WebhookResult["status"], number> = {
  "no-gateway": 404,
  rejected: 400,
  duplicate: 200,
  settled: 200,
  failed: 200,
  ignored: 200,
};

/**
 * The webhook route's answer: the raw body (bounded) handed to `handle`, and
 * a bare status back. Nothing about the payment is ever in the response.
 */
export async function webhookResponse(request: Request, handle: (rawBody: string, headers: { get(name: string): string | null }) => Promise<WebhookResult>): Promise<Response> {
  const headers = { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" };
  const rawBody = await readBodyWithin(request, webhookBodyLimit);
  if (rawBody === null) return new Response("Too large", { status: 413, headers });
  const { status } = await handle(rawBody, request.headers);
  const code = webhookStatus[status];
  return new Response(code === 200 ? "OK" : code === 404 ? "Not found" : "Bad request", { status: code, headers });
}
