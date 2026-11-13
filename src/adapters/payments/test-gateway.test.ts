import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fixedClock } from "@/lib/kernel/ports";
import { createTestGateway, signTestWebhook, testSignatureHeader, testTimestampHeader } from "./test-gateway";

const secret = "a test secret that is long enough";
const now = new Date("2026-11-12T08:00:00Z");
const event = { id: "evt_1", providerRef: "test_abc", status: "paid" as const, amountCents: 60_000 };
const headersOf = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null });

describe("the test payment gateway", () => {
  it("makes a checkout link back to the given page with a fresh reference", async () => {
    const gateway = createTestGateway({ secret, clock: fixedClock(now) });
    const first = await gateway.createCheckout({ bookingId: "b1", ref: "RG-B2C3D", amountCents: 60_000, returnUrl: "https://example.com/admin/bookings/b1/money" });
    const second = await gateway.createCheckout({ bookingId: "b1", ref: "RG-B2C3D", amountCents: 60_000, returnUrl: "https://example.com/admin/bookings/b1/money" });
    assert.match(first.providerRef, /^test_[0-9a-f]{24}$/);
    assert.notEqual(first.providerRef, second.providerRef);
    assert.equal(first.checkoutUrl, `https://example.com/admin/bookings/b1/money?test-checkout=${first.providerRef}`);
  });

  it("trusts a webhook it signed, and nothing else", async () => {
    const gateway = createTestGateway({ secret, clock: fixedClock(now) });
    const { rawBody, headers } = signTestWebhook(secret, event, now);
    assert.deepEqual(await gateway.verifyWebhook(rawBody, headersOf(headers)), { ok: true, ...event });
    const tampered = rawBody.replace("60000", "6000");
    assert.deepEqual(await gateway.verifyWebhook(tampered, headersOf(headers)), { ok: false, reason: "bad-signature" });
    const otherSecret = signTestWebhook("another secret that is long enough", event, now);
    assert.deepEqual(await gateway.verifyWebhook(otherSecret.rawBody, headersOf(otherSecret.headers)), { ok: false, reason: "bad-signature" });
    assert.deepEqual(await gateway.verifyWebhook(rawBody, headersOf({})), { ok: false, reason: "malformed" });
    assert.deepEqual(await gateway.verifyWebhook(rawBody, headersOf({ ...headers, [testSignatureHeader]: "zz" })), { ok: false, reason: "malformed" });
  });

  it("refuses a webhook signed more than five minutes away from now, so old ones can't be replayed", async () => {
    const gateway = createTestGateway({ secret, clock: fixedClock(now) });
    const old = signTestWebhook(secret, event, new Date(now.getTime() - 6 * 60_000));
    assert.deepEqual(await gateway.verifyWebhook(old.rawBody, headersOf(old.headers)), { ok: false, reason: "stale" });
    const recent = signTestWebhook(secret, event, new Date(now.getTime() - 4 * 60_000));
    assert.equal((await gateway.verifyWebhook(recent.rawBody, headersOf(recent.headers))).ok, true);
    assert.ok(recent.headers[testTimestampHeader]);
  });

  it("refuses a signed body that isn't an event, and a short secret", async () => {
    const gateway = createTestGateway({ secret, clock: fixedClock(now) });
    const { rawBody, headers } = signTestWebhook(secret, { ...event, amountCents: -1 }, now);
    assert.deepEqual(await gateway.verifyWebhook(rawBody, headersOf(headers)), { ok: false, reason: "malformed" });
    assert.throws(() => createTestGateway({ secret: "short", clock: fixedClock(now) }));
  });
});
