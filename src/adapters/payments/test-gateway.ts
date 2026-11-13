import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Clock } from "@/lib/kernel/ports";
import type { PaymentGateway, VerifiedEvent, WebhookRefusal } from "@/lib/money/ports";

/**
 * A stand-in payment gateway for development and tests, never a real one:
 * no money moves. It does what a real adapter must, so the webhook route and
 * settlement are exercised end to end:
 * - a checkout gives a provider reference and a link (here, back to the
 *   booking's money page, saying it's a test);
 * - webhooks are signed with HMAC-SHA256 over "<timestamp>.<raw body>",
 *   sent as `x-test-timestamp` (Unix seconds) and `x-test-signature` (hex);
 *   a signature is compared in constant time, and a timestamp more than five
 *   minutes from now is refused, so an old webhook can't be replayed.
 *
 * Choosing a real gateway (PayFast, Yoco, Peach Payments, Paystack…) is the
 * owner's decision (open question #11); its adapter implements the same
 * port.
 */

export const testSignatureHeader = "x-test-signature";
export const testTimestampHeader = "x-test-timestamp";

/** How far a webhook's timestamp may be from now. */
export const toleranceSeconds = 5 * 60;

const eventSchema = z.object({
  id: z.string().min(1).max(200),
  providerRef: z.string().min(1).max(200),
  status: z.enum(["paid", "failed"]),
  amountCents: z.number().int().min(1).max(100_000_000),
});

export type TestWebhookEvent = z.output<typeof eventSchema>;

const signatureOf = (secret: string, timestamp: string, rawBody: string) => createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();

/** A webhook as the test gateway would send it: the raw body and its headers. */
export function signTestWebhook(secret: string, event: TestWebhookEvent, now: Date): { rawBody: string; headers: Record<string, string> } {
  const rawBody = JSON.stringify(event);
  const timestamp = String(Math.floor(now.getTime() / 1000));
  return { rawBody, headers: { [testTimestampHeader]: timestamp, [testSignatureHeader]: signatureOf(secret, timestamp, rawBody).toString("hex") } };
}

export function createTestGateway({ secret, clock }: { secret: string; clock: Clock }): PaymentGateway {
  if (secret.length < 16) throw new Error("The test gateway's secret must be at least 16 characters.");
  return {
    name: "test",
    testMode: true,

    async createCheckout({ returnUrl }) {
      const providerRef = `test_${randomBytes(12).toString("hex")}`;
      const url = new URL(returnUrl);
      url.searchParams.set("test-checkout", providerRef);
      return { providerRef, checkoutUrl: url.toString() };
    },

    async verifyWebhook(rawBody, headers): Promise<VerifiedEvent | WebhookRefusal> {
      const timestamp = headers.get(testTimestampHeader) ?? "";
      const signature = headers.get(testSignatureHeader) ?? "";
      if (!/^\d{1,12}$/.test(timestamp) || !/^[0-9a-f]{64}$/.test(signature)) return { ok: false, reason: "malformed" };
      const expected = signatureOf(secret, timestamp, rawBody);
      const actual = Buffer.from(signature, "hex");
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return { ok: false, reason: "bad-signature" };
      if (Math.abs(clock.now().getTime() / 1000 - Number(timestamp)) > toleranceSeconds) return { ok: false, reason: "stale" };
      let body: unknown;
      try {
        body = JSON.parse(rawBody);
      } catch {
        return { ok: false, reason: "malformed" };
      }
      const parsed = eventSchema.safeParse(body);
      if (!parsed.success) return { ok: false, reason: "malformed" };
      return { ok: true, ...parsed.data };
    },
  };
}
