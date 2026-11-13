import type { Invoice, Payment } from "../money";
import type { MoneyStore } from "../ports";

/**
 * What every MoneyStore must do, as cases run against a fresh store whose
 * database already holds the booking `bookingId` (Postgres checks the
 * foreign key; memory doesn't care):
 *
 *   for (const { name, run } of moneyStoreContract) it(name, async () => run(await storeWithBooking()));
 */
export type MoneyStoreCase = { name: string; run: (store: MoneyStore, bookingId: string) => Promise<void> };

const ownerId = "00000000-0000-4000-8000-0000000000a1";
const at = new Date("2026-11-12T08:00:00.000Z");
const later = new Date("2026-11-12T09:00:00.000Z");

let counter = 0;
const nextId = () => `00000000-0000-4000-8000-0000000e${String((counter += 1)).padStart(4, "0")}`;

export function testPayment(bookingId: string, fields: Partial<Payment> = {}): Payment {
  return {
    id: nextId(),
    bookingId,
    kind: "deposit",
    method: "eft",
    amountCents: 60_000,
    receivedOn: "2026-11-12",
    reference: "RG-B2C3D",
    status: "received",
    receiptNumber: null,
    providerRef: null,
    idempotencyKey: null,
    recordedBy: ownerId,
    createdAt: at,
    voidedAt: null,
    voidReason: null,
    ...fields,
  };
}

export function testInvoice(bookingId: string, fields: Partial<Invoice> = {}): Invoice {
  return {
    id: nextId(),
    bookingId,
    number: "",
    issuedOn: "2026-11-12",
    billedTo: { name: "Thandi Mokoena", phone: "+27821234567", email: null },
    lines: [{ description: "Family apartment with shower (Unit 1), 3 nights", quantity: 1, unitCents: 240_000, amountCents: 240_000 }],
    totalCents: 240_000,
    vatCents: null,
    status: "issued",
    voidReason: null,
    voidedAt: null,
    createdBy: ownerId,
    createdAt: at,
    ...fields,
  };
}

export const moneyStoreContract: readonly MoneyStoreCase[] = [
  {
    name: "records payments, giving received ones the next receipt number and waiting ones none",
    async run(store, bookingId) {
      const first = testPayment(bookingId);
      expectSame(await store.recordPayment(first), { status: "recorded", receiptNumber: "RC-000001" }, "first");
      const pending = testPayment(bookingId, { status: "pending", method: "gateway", providerRef: "test_abc", createdAt: later });
      expectSame(await store.recordPayment(pending), { status: "recorded", receiptNumber: null }, "pending");
      const second = testPayment(bookingId, { kind: "balance", createdAt: later });
      expectSame(await store.recordPayment(second), { status: "recorded", receiptNumber: "RC-000002" }, "second");
      expectSame(await store.payment(first.id), { ...first, receiptNumber: "RC-000001" }, "read back");
      expectSame((await store.payments(bookingId)).map((payment) => payment.id), [first.id, pending.id, second.id], "in order");
    },
  },
  {
    name: "refuses a second payment with the same idempotency key or gateway reference",
    async run(store, bookingId) {
      await store.recordPayment(testPayment(bookingId, { idempotencyKey: "form-1" }));
      expectSame(await store.recordPayment(testPayment(bookingId, { idempotencyKey: "form-1" })), { status: "duplicate" }, "same key");
      await store.recordPayment(testPayment(bookingId, { status: "pending", method: "gateway", providerRef: "test_1" }));
      expectSame(await store.recordPayment(testPayment(bookingId, { status: "pending", method: "gateway", providerRef: "test_1" })), { status: "duplicate" }, "same ref");
      expectSame((await store.payments(bookingId)).length, 2, "only two stored");
    },
  },
  {
    name: "refuses refunds beyond what's been paid, even two at once, without using a receipt number",
    async run(store, bookingId) {
      await store.recordPayment(testPayment(bookingId, { amountCents: 60_000 }));
      await store.recordPayment(testPayment(bookingId, { amountCents: 40_000, voidedAt: later, voidReason: "Entered twice" }));
      const refund = () => testPayment(bookingId, { kind: "refund", amountCents: 50_000 });
      const outcomes = await Promise.all([store.recordPayment(refund()), store.recordPayment(refund())]);
      expectSame(outcomes.map((outcome) => outcome.status).sort(), ["over-refund", "recorded"], "only one of two refunds fits");
      expectSame(outcomes.find((outcome) => outcome.status === "over-refund"), { status: "over-refund", paidCents: 10_000 }, "what was left");
      expectSame(await store.recordPayment(testPayment(bookingId, { kind: "balance", amountCents: 1 })), { status: "recorded", receiptNumber: "RC-000004" }, "no gap");
    },
  },
  {
    name: "voids a payment once, keeping it on record",
    async run(store, bookingId) {
      const payment = testPayment(bookingId);
      await store.recordPayment(payment);
      expectSame(await store.voidPayment(payment.id, later, "Entered twice"), true, "void");
      expectSame(await store.voidPayment(payment.id, later, "again"), false, "again");
      const voided = await store.payment(payment.id);
      expectSame([voided?.voidedAt, voided?.voidReason, voided?.receiptNumber], [later, "Entered twice", "RC-000001"], "kept");
    },
  },
  {
    name: "issues invoices with sequential numbers and voids without deleting",
    async run(store, bookingId) {
      const first = testInvoice(bookingId);
      expectSame(await store.issueInvoice(first), { number: "INV-000001" }, "first");
      const second = testInvoice(bookingId, { createdAt: later, totalCents: 250_000 });
      expectSame(await store.issueInvoice(second), { number: "INV-000002" }, "second");
      expectSame(await store.invoice(first.id), { ...first, number: "INV-000001" }, "read back");
      expectSame(await store.voidInvoice(first.id, later, "Wrong dates"), true, "void");
      expectSame(await store.voidInvoice(first.id, later, "again"), false, "again");
      const voided = await store.invoice(first.id);
      expectSame([voided?.status, voided?.voidReason, voided?.voidedAt], ["void", "Wrong dates", later], "voided");
      expectSame((await store.invoices(bookingId)).map((invoice) => invoice.number), ["INV-000001", "INV-000002"], "both kept");
    },
  },
  {
    name: "settles a waiting online payment once, with its receipt, only for the amount asked",
    async run(store, bookingId) {
      const pending = testPayment(bookingId, { status: "pending", method: "gateway", providerRef: "test_xyz", amountCents: 50_000 });
      await store.recordPayment(pending);
      expectSame((await store.settleGatewayPayment("test_none", 50_000, later)).status, "not-found", "unknown ref");
      expectSame((await store.settleGatewayPayment("test_xyz", 40_000, later)).status, "amount-mismatch", "wrong amount");
      const settled = await store.settleGatewayPayment("test_xyz", 50_000, later);
      expectSame(settled.status === "settled" ? [settled.payment.status, settled.payment.receiptNumber] : null, ["received", "RC-000001"], "settled");
      expectSame((await store.settleGatewayPayment("test_xyz", 50_000, later)).status, "already-final", "again");
      const failing = testPayment(bookingId, { status: "pending", method: "gateway", providerRef: "test_fail" });
      await store.recordPayment(failing);
      expectSame(await store.failGatewayPayment("test_fail"), true, "fail");
      expectSame(await store.failGatewayPayment("test_fail"), false, "fail again");
      expectSame((await store.payment(failing.id))?.status, "failed", "failed");
    },
  },
  {
    name: "records each webhook event once",
    async run(store) {
      const event = { provider: "test", providerEventId: "evt_1", receivedAt: at, payloadHash: "a".repeat(64) };
      expectSame(await store.recordWebhookEvent(event), true, "first");
      expectSame(await store.recordWebhookEvent({ ...event, receivedAt: later }), false, "replay");
      expectSame(await store.recordWebhookEvent({ ...event, provider: "other" }), true, "another provider");
      await store.setWebhookOutcome("test", "evt_1", "settled");
    },
  },
];

/** JSON with object keys in order, so two stores may build records in different orders. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );
}

function expectSame(actual: unknown, expected: unknown, what: string): void {
  const a = canonical(actual);
  const e = canonical(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}
