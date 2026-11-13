import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Actor, Role } from "@/lib/kernel/actor";
import { memoryAuditRecorder } from "@/lib/kernel/audit";
import { fixedClock } from "@/lib/kernel/ports";
import { summaryOf, type BookingForMoney, type Payment } from "./money";
import { createMoneyService } from "./money-service";
import type { MoneyAccess, MoneyPermission, PaymentGateway, VerifiedEvent } from "./ports";
import { createMemoryMoneyStore } from "./testing/memory-store";

class NotAllowed extends Error {}

const grants: Record<Role, readonly MoneyPermission[]> = {
  owner: ["booking-money:manage", "refunds:issue"],
  admin: [],
  sales: ["booking-money:manage"],
  staff: [],
};

const access: MoneyAccess = {
  can: (actor, permission) => grants[actor.role].includes(permission),
  assertCan: (actor, permission) => {
    if (!grants[actor.role].includes(permission)) throw new NotAllowed(permission);
  },
};

const actor = (role: Role): Actor => ({ id: `00000000-0000-4000-8000-0000000000${role.length}1`, role, name: role });
const owner = actor("owner");
const sales = actor("sales");

const booking: BookingForMoney = {
  id: "b1",
  ref: "RG-B2C3D",
  status: "confirmed",
  apartmentName: "Family room with shower",
  unitName: "Unit 1",
  stay: { arrive: "2026-12-10", leave: "2026-12-13" },
  adults: 2,
  children: 1,
  totalCents: 240_000,
  depositDueCents: 60_000,
  guest: { name: "Thandi Mokoena", phone: "+27821234567", email: null },
};

/** A gateway whose webhooks are trusted when the "signature" header reads "good". */
function fakeGateway(): PaymentGateway {
  let next = 0;
  return {
    name: "fake",
    testMode: true,
    async createCheckout() {
      next += 1;
      return { providerRef: `ref_${next}`, checkoutUrl: `https://example.com/pay/ref_${next}` };
    },
    async verifyWebhook(rawBody, headers) {
      if (headers.get("signature") !== "good") return { ok: false, reason: "bad-signature" };
      return { ok: true, ...(JSON.parse(rawBody) as Omit<VerifiedEvent, "ok">) };
    },
  };
}

function harness({ gateway = fakeGateway() as PaymentGateway | null } = {}) {
  const store = createMemoryMoneyStore();
  const audit = memoryAuditRecorder();
  let next = 0;
  const service = createMoneyService({
    store,
    bookings: { booking: async (id) => (id === booking.id ? booking : null) },
    gateway,
    sha256: () => "0".repeat(64),
    returnUrlFor: (id) => `https://example.com/admin/bookings/${id}/money`,
    clock: fixedClock("2026-11-12T08:00:00Z"),
    ids: { newId: () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}` },
    audit,
    access,
    timeZone: "Africa/Johannesburg",
  });
  return { service, store, audit };
}

const signed = (event: Omit<VerifiedEvent, "ok">) => ({ rawBody: JSON.stringify(event), headers: { get: (name: string) => (name === "signature" ? "good" : null) } });

describe("booking money", () => {
  it("works out what's paid and owed, ignoring voided and waiting payments, and taking off refunds", () => {
    const base = { id: "p", bookingId: "b1", method: "eft", receivedOn: "2026-11-12", reference: null, receiptNumber: null, providerRef: null, idempotencyKey: null, recordedBy: null, createdAt: new Date(0), voidReason: null } as const;
    const payments: Payment[] = [
      { ...base, kind: "deposit", amountCents: 60_000, status: "received", voidedAt: null },
      { ...base, kind: "balance", amountCents: 100_000, status: "received", voidedAt: new Date(0), voidReason: "Entered twice" },
      { ...base, kind: "balance", amountCents: 50_000, status: "pending", voidedAt: null },
      { ...base, kind: "refund", amountCents: 10_000, status: "received", voidedAt: null },
    ];
    assert.deepEqual(summaryOf(booking, payments), {
      totalCents: 240_000,
      depositDueCents: 60_000,
      paidCents: 50_000,
      refundedCents: 10_000,
      balanceCents: 190_000,
      depositOutstandingCents: 10_000,
    });
  });

  it("records a payment with its receipt, once, and audits it under money", async () => {
    const { service, audit } = harness();
    const input = { kind: "deposit", method: "eft", amount: "600", receivedOn: "2026-11-12", reference: "RG-B2C3D", idempotencyKey: "form-1" };
    assert.deepEqual(await service.recordPayment(sales, "b1", input), { ok: true, receiptNumber: "RC-000001" });
    assert.deepEqual(await service.recordPayment(sales, "b1", input), { ok: false, errors: { form: "This payment is already recorded. Reload the page to see it." } });
    const account = await service.account(sales, "b1");
    assert.equal(account?.summary.paidCents, 60_000);
    assert.equal(account?.summary.balanceCents, 180_000);
    assert.deepEqual(audit.events.map((event) => [event.category, event.action]), [["money", "payment.recorded"]]);
    assert.match(audit.events[0]!.summary, /Deposit of R600 by EFT for booking RG-B2C3D \(receipt RC-000001\)/);
  });

  it("refuses a future date, a bad amount and an online payment typed in by hand", async () => {
    const { service } = harness();
    const refused = await service.recordPayment(owner, "b1", { kind: "balance", method: "gateway", amount: "0", receivedOn: "2026-11-30" });
    assert.equal(refused.ok, false);
    assert.deepEqual(Object.keys(refused.ok ? {} : refused.errors).sort(), ["amount", "method"]);
    const future = await service.recordPayment(owner, "b1", { kind: "balance", method: "cash", amount: "100", receivedOn: "2026-11-30" });
    assert.deepEqual(future, { ok: false, errors: { receivedOn: "Choose today or an earlier day: record a payment once it's received." } });
  });

  it("lets only the owner refund, and never more than was paid", async () => {
    const { service } = harness();
    await service.recordPayment(owner, "b1", { kind: "deposit", method: "cash", amount: "600", receivedOn: "2026-11-12" });
    const refund = { kind: "refund", method: "eft", amount: "200", receivedOn: "2026-11-12" };
    await assert.rejects(service.recordPayment(sales, "b1", refund), NotAllowed);
    assert.equal((await service.recordPayment(owner, "b1", refund)).ok, true);
    const tooMuch = await service.recordPayment(owner, "b1", { ...refund, amount: "500" });
    assert.deepEqual(tooMuch, { ok: false, errors: { amount: "A refund can't be more than what's been paid (R400)." } });
    assert.equal((await service.account(owner, "b1"))?.summary.paidCents, 40_000);
  });

  it("voids a payment, keeping it, and leaves voiding a refund to the owner", async () => {
    const { service, store } = harness();
    await service.recordPayment(owner, "b1", { kind: "deposit", method: "cash", amount: "600", receivedOn: "2026-11-12" });
    await service.recordPayment(owner, "b1", { kind: "refund", method: "cash", amount: "100", receivedOn: "2026-11-12" });
    const [deposit, refund] = await store.payments("b1");
    assert.deepEqual(await service.voidPayment(sales, "b1", deposit!.id, { reason: "" }), { ok: false, errors: { reason: "Say why it's being voided." } });
    assert.deepEqual(await service.voidPayment(sales, "b1", deposit!.id, { reason: "Entered on the wrong booking" }), { ok: true });
    await assert.rejects(service.voidPayment(sales, "b1", refund!.id, { reason: "Mistake" }), NotAllowed);
    assert.equal((await service.voidPayment(sales, "b1", deposit!.id, { reason: "again" })).ok, false);
    assert.equal((await store.payment(deposit!.id))?.voidReason, "Entered on the wrong booking");
  });

  it("issues invoices from the booking with extra lines and no VAT, numbered in order, and voids them", async () => {
    const { service } = harness();
    assert.deepEqual(await service.invoicePreview(sales, "b1"), [
      { description: "Family room with shower, Thu 10 Dec to Sun 13 Dec 2026, 3 nights", quantity: 1, unitCents: 240_000, amountCents: 240_000 },
    ]);
    const issued = await service.issueInvoice(sales, "b1", { "extras.0.description": "Laundry", "extras.0.amount": "150", "extras.1.description": "", "extras.1.amount": "" });
    assert.equal(issued.ok && issued.number, "INV-000001");
    const document = await service.invoiceDocument(sales, "b1", issued.ok ? issued.id : "");
    assert.deepEqual(
      document?.invoice.lines.map((line) => [line.description.slice(0, 13), line.amountCents]),
      [
        ["Family room w", 240_000],
        ["Laundry", 15_000],
      ],
    );
    assert.equal(document?.invoice.totalCents, 255_000);
    assert.equal(document?.invoice.vatCents, null);
    assert.deepEqual(await service.issueInvoice(sales, "b1", { "extras.0.description": "Laundry", "extras.0.amount": "" }), {
      ok: false,
      errors: { "extras.0.amount": "Enter the line's amount in rand." },
    });
    assert.equal((await service.voidInvoice(sales, "b1", issued.ok ? issued.id : "", { reason: "Wrong extras" })).ok, true);
    const second = await service.issueInvoice(sales, "b1", {});
    assert.equal(second.ok && second.number, "INV-000002");
  });

  it("makes a payment link and settles it once from a signed webhook, refusing forgeries and wrong amounts", async () => {
    const { service, store, audit } = harness();
    const link = await service.createCheckout(sales, "b1", { amount: "600" });
    assert.ok(link.ok);
    const [pending] = await store.payments("b1");
    assert.deepEqual([pending?.kind, pending?.status, pending?.method], ["deposit", "pending", "gateway"]);
    const forged = { rawBody: JSON.stringify({ id: "evt_0", providerRef: "ref_1", status: "paid", amountCents: 60_000 }), headers: { get: () => "bad" } };
    assert.deepEqual(await service.handleWebhook(forged.rawBody, forged.headers), { status: "rejected" });
    const wrong = signed({ id: "evt_1", providerRef: "ref_1", status: "paid", amountCents: 1 });
    assert.deepEqual(await service.handleWebhook(wrong.rawBody, wrong.headers), { status: "ignored" });
    const paid = signed({ id: "evt_2", providerRef: "ref_1", status: "paid", amountCents: 60_000 });
    assert.deepEqual(await service.handleWebhook(paid.rawBody, paid.headers), { status: "settled" });
    assert.deepEqual(await service.handleWebhook(paid.rawBody, paid.headers), { status: "duplicate" });
    const settled = await store.payment(pending!.id);
    assert.deepEqual([settled?.status, settled?.receiptNumber], ["received", "RC-000001"]);
    assert.equal(audit.events.at(-1)?.action, "payment.received-online");
    assert.equal(audit.events.at(-1)?.actor, null);
    assert.deepEqual(await service.createCheckout(sales, "b1", { amount: "5000" }), { ok: false, errors: { amount: "Ask for no more than the balance (R1,800)." } });
  });

  it("without a gateway: no links, and webhooks answer that there's none", async () => {
    const { service } = harness({ gateway: null });
    assert.deepEqual(await service.createCheckout(owner, "b1", { amount: "600" }), {
      ok: false,
      errors: { form: "No payment gateway is set up yet; record payments as you receive them." },
    });
    assert.deepEqual(await service.handleWebhook("{}", { get: () => null }), { status: "no-gateway" });
    assert.deepEqual((await service.account(owner, "b1"))?.gateway, { ready: false, testMode: false });
  });

  it("refuses admin and staff every money path", async () => {
    const { service } = harness();
    for (const role of ["admin", "staff"] as const) {
      const who = actor(role);
      await assert.rejects(service.account(who, "b1"), NotAllowed);
      await assert.rejects(service.recordPayment(who, "b1", {}), NotAllowed);
      await assert.rejects(service.voidPayment(who, "b1", "p", {}), NotAllowed);
      await assert.rejects(service.invoicePreview(who, "b1"), NotAllowed);
      await assert.rejects(service.issueInvoice(who, "b1", {}), NotAllowed);
      await assert.rejects(service.voidInvoice(who, "b1", "i", {}), NotAllowed);
      await assert.rejects(service.invoiceDocument(who, "b1", "i"), NotAllowed);
      await assert.rejects(service.receiptDocument(who, "b1", "p"), NotAllowed);
      await assert.rejects(service.createCheckout(who, "b1", {}), NotAllowed);
    }
  });
});
