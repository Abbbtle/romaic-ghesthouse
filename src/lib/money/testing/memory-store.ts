import { counts, formatNumber, type Invoice, type Payment } from "../money";
import type { GatewaySettlement, MoneyStore, PaymentRecording, WebhookEventRecord } from "../ports";

/** Payments, invoices and webhook events in memory, for tests, with the Postgres store's rules (./store-contract.ts checks both). */
export function createMemoryMoneyStore(): MoneyStore {
  const payments = new Map<string, Payment>();
  const invoices = new Map<string, Invoice>();
  const events = new Map<string, WebhookEventRecord & { outcome: string }>();
  const sequences = { RC: 0, INV: 0 };
  const copy = <T>(value: T): T => structuredClone(value);
  const next = (prefix: "RC" | "INV") => formatNumber(prefix, (sequences[prefix] += 1));
  const byCreation = <T extends { createdAt: Date }>(list: T[]) => list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return {
    async payments(bookingId) {
      return byCreation([...payments.values()].filter((payment) => payment.bookingId === bookingId)).map(copy);
    },
    async payment(id) {
      const payment = payments.get(id);
      return payment ? copy(payment) : null;
    },
    async invoices(bookingId) {
      return byCreation([...invoices.values()].filter((invoice) => invoice.bookingId === bookingId)).map(copy);
    },
    async invoice(id) {
      const invoice = invoices.get(id);
      return invoice ? copy(invoice) : null;
    },
    async recordPayment(payment): Promise<PaymentRecording> {
      const clash = [...payments.values()].some(
        (other) =>
          (payment.idempotencyKey !== null && other.idempotencyKey === payment.idempotencyKey) || (payment.providerRef !== null && other.providerRef === payment.providerRef),
      );
      if (clash) return { status: "duplicate" };
      if (payment.kind === "refund") {
        const counted = [...payments.values()].filter((other) => other.bookingId === payment.bookingId && counts(other));
        const paidCents = counted.reduce((sum, other) => sum + (other.kind === "refund" ? -other.amountCents : other.amountCents), 0);
        if (payment.amountCents > paidCents) return { status: "over-refund", paidCents };
      }
      const receiptNumber = payment.status === "received" ? next("RC") : null;
      payments.set(payment.id, copy({ ...payment, receiptNumber }));
      return { status: "recorded", receiptNumber };
    },
    async voidPayment(id, at, reason) {
      const payment = payments.get(id);
      if (!payment || payment.voidedAt) return false;
      payments.set(id, { ...payment, voidedAt: at, voidReason: reason });
      return true;
    },
    async issueInvoice(invoice) {
      const number = next("INV");
      invoices.set(invoice.id, copy({ ...invoice, number }));
      return { number };
    },
    async voidInvoice(id, at, reason) {
      const invoice = invoices.get(id);
      if (!invoice || invoice.status === "void") return false;
      invoices.set(id, { ...invoice, status: "void", voidedAt: at, voidReason: reason });
      return true;
    },
    async settleGatewayPayment(providerRef, amountCents): Promise<GatewaySettlement> {
      const payment = [...payments.values()].find((candidate) => candidate.providerRef === providerRef);
      if (!payment) return { status: "not-found" };
      if (payment.status !== "pending" || payment.voidedAt) return { status: "already-final", payment: copy(payment) };
      if (payment.amountCents !== amountCents) return { status: "amount-mismatch", payment: copy(payment) };
      const settled: Payment = { ...payment, status: "received", receiptNumber: next("RC") };
      payments.set(payment.id, settled);
      return { status: "settled", payment: copy(settled) };
    },
    async failGatewayPayment(providerRef) {
      const payment = [...payments.values()].find((candidate) => candidate.providerRef === providerRef && candidate.status === "pending");
      if (!payment) return false;
      payments.set(payment.id, { ...payment, status: "failed" });
      return true;
    },
    async recordWebhookEvent(event) {
      const key = `${event.provider}:${event.providerEventId}`;
      if (events.has(key)) return false;
      events.set(key, { ...event, outcome: "received" });
      return true;
    },
    async setWebhookOutcome(provider, providerEventId, outcome) {
      const event = events.get(`${provider}:${providerEventId}`);
      if (event) event.outcome = outcome;
    },
  };
}
