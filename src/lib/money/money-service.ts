import { parseWith } from "@/lib/forms/parse";
import { formatCents } from "@/lib/format/money";
import { zonedToday } from "@/lib/format/zoned-time";
import { stayLabel } from "@/lib/inventory/stays";
import type { Actor } from "@/lib/kernel/actor";
import type { AuditRecorder } from "@/lib/kernel/audit";
import type { Clock, IdGenerator } from "@/lib/kernel/ports";
import { done, refused, refusedWith, type ChangeResult } from "@/lib/kernel/result";
import { extrasFromForm, issueInvoiceSchema, recordPaymentSchema, testCheckoutSchema, voidSchema } from "./money-input";
import { paymentKindNames, paymentMethodNames, summaryOf, type BookingForMoney, type Invoice, type InvoiceLine, type MoneySummary, type Payment } from "./money";
import type { BookingReader, MoneyAccess, MoneyStore, PaymentGateway } from "./ports";

export type MoneyServiceDependencies = {
  store: MoneyStore;
  bookings: BookingReader;
  /** The online payment provider; null when none is set up (the dashboard then records payments by hand only). */
  gateway: PaymentGateway | null;
  /** SHA-256 of text, hex: webhook bodies are kept as a hash, never in full. */
  sha256: (text: string) => string;
  /** Where the gateway sends the guest back after paying for a booking. */
  returnUrlFor: (bookingId: string) => string;
  clock: Clock;
  ids: IdGenerator;
  audit: AuditRecorder;
  access: MoneyAccess;
  timeZone: string;
};

/** A booking's money, as its money page shows it. */
export type MoneyAccount = {
  booking: BookingForMoney;
  payments: Payment[];
  invoices: Invoice[];
  summary: MoneySummary;
  /** Whether an online payment link can be made, and whether it's the test adapter. */
  gateway: { ready: boolean; testMode: boolean };
  canRefund: boolean;
};

/** What the webhook route answers with: how the event was handled, never its details. */
export type WebhookResult =
  | { status: "no-gateway" }
  | { status: "rejected" }
  | { status: "duplicate" }
  | { status: "settled" | "failed" | "ignored" };

const bookingGone = "This booking no longer exists. Reload the page.";

/** The invoice's first line: the stay itself, at the booking's agreed total. Unit names are the team's own, so the guest sees the apartment. */
export function stayLine(booking: BookingForMoney): InvoiceLine {
  return {
    description: `${booking.apartmentName}, ${stayLabel(booking.stay)}`,
    quantity: 1,
    unitCents: booking.totalCents,
    amountCents: booking.totalCents,
  };
}

/**
 * Booking money from the dashboard and the gateway: record and void
 * payments (refunds are the owner's), issue and void invoices, print
 * receipts and invoices, and, with a gateway, payment links and their
 * webhooks. Every amount is in cents.
 */
export function createMoneyService(deps: MoneyServiceDependencies) {
  const { store, bookings, clock, ids, audit, access } = deps;
  const today = () => zonedToday(clock.now(), deps.timeZone);

  async function record(actor: Actor | null, action: string, summary: string, target: { type: string; id: string }) {
    await audit.record({ actor, category: "money", action, target, summary });
  }

  async function bookingOr(bookingId: string): Promise<BookingForMoney | null> {
    return bookings.booking(bookingId);
  }

  return {
    async account(actor: Actor, bookingId: string): Promise<MoneyAccount | null> {
      access.assertCan(actor, "booking-money:manage");
      const booking = await bookingOr(bookingId);
      if (!booking) return null;
      const [payments, invoices] = await Promise.all([store.payments(bookingId), store.invoices(bookingId)]);
      return {
        booking,
        payments,
        invoices,
        summary: summaryOf(booking, payments),
        gateway: { ready: deps.gateway !== null, testMode: deps.gateway?.testMode ?? false },
        canRefund: access.can(actor, "refunds:issue"),
      };
    },

    /** Records a payment received by hand (cash, card machine, EFT, or collected by a channel). A refund is the owner's alone. */
    async recordPayment(actor: Actor, bookingId: string, input: unknown): Promise<ChangeResult<{ receiptNumber: string | null }>> {
      access.assertCan(actor, "booking-money:manage");
      const parsed = parseWith(recordPaymentSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const draft = parsed.value;
      if (draft.kind === "refund") access.assertCan(actor, "refunds:issue");
      if (draft.receivedOn > today()) return refused({ receivedOn: "Choose today or an earlier day: record a payment once it's received." });
      const booking = await bookingOr(bookingId);
      if (!booking) return refusedWith(bookingGone);
      if (draft.kind === "refund") {
        const summary = summaryOf(booking, await store.payments(bookingId));
        if (draft.amount > summary.paidCents) return refused({ amount: `A refund can't be more than what's been paid (${formatCents(summary.paidCents)}).` });
      }
      const payment: Payment = {
        id: ids.newId(),
        bookingId,
        kind: draft.kind,
        method: draft.method,
        amountCents: draft.amount,
        receivedOn: draft.receivedOn,
        reference: draft.reference,
        status: "received",
        receiptNumber: null,
        providerRef: null,
        idempotencyKey: draft.idempotencyKey,
        recordedBy: actor.id,
        createdAt: clock.now(),
        voidedAt: null,
        voidReason: null,
      };
      const outcome = await store.recordPayment(payment);
      if (outcome.status === "duplicate") return refusedWith("This payment is already recorded. Reload the page to see it.");
      if (outcome.status === "over-refund") return refused({ amount: `A refund can't be more than what's been paid (${formatCents(outcome.paidCents)}).` });
      await record(
        actor,
        draft.kind === "refund" ? "payment.refunded" : "payment.recorded",
        `${paymentKindNames[draft.kind]} of ${formatCents(draft.amount)} by ${paymentMethodNames[draft.method]} for booking ${booking.ref}${outcome.receiptNumber ? ` (receipt ${outcome.receiptNumber})` : ""}`,
        { type: "payment", id: payment.id },
      );
      return done({ receiptNumber: outcome.receiptNumber });
    },

    /** Voids a payment entered by mistake: it stays on record, crossed out, with the reason. Voiding a refund is the owner's. */
    async voidPayment(actor: Actor, bookingId: string, paymentId: string, input: unknown): Promise<ChangeResult> {
      access.assertCan(actor, "booking-money:manage");
      const parsed = parseWith(voidSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const payment = await store.payment(paymentId);
      if (!payment || payment.bookingId !== bookingId || payment.voidedAt) return refusedWith("This payment was already voided, or isn't on this booking. Reload the page.");
      if (payment.kind === "refund") access.assertCan(actor, "refunds:issue");
      if (!(await store.voidPayment(paymentId, clock.now(), parsed.value.reason))) return refusedWith("This payment was already voided. Reload the page.");
      await record(actor, "payment.voided", `Voided ${paymentKindNames[payment.kind].toLowerCase()} of ${formatCents(payment.amountCents)}: ${parsed.value.reason}`, {
        type: "payment",
        id: paymentId,
      });
      return done();
    },

    /** The lines a new invoice for the booking would carry before any extras. */
    async invoicePreview(actor: Actor, bookingId: string): Promise<InvoiceLine[] | null> {
      access.assertCan(actor, "booking-money:manage");
      const booking = await bookingOr(bookingId);
      return booking ? [stayLine(booking)] : null;
    },

    /** Issues an invoice: the stay at its agreed total, plus any extra lines, billed to the guest as they are today, with the next number. */
    async issueInvoice(actor: Actor, bookingId: string, input: unknown): Promise<ChangeResult<{ id: string; number: string }>> {
      access.assertCan(actor, "booking-money:manage");
      const fields = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
      const parsed = parseWith(issueInvoiceSchema, "extras" in fields ? fields : extrasFromForm(fields));
      if (!parsed.ok) return refused(parsed.errors);
      const booking = await bookingOr(bookingId);
      if (!booking) return refusedWith(bookingGone);
      const lines: InvoiceLine[] = [
        stayLine(booking),
        ...parsed.value.extras.map((line) => ({ description: line.description, quantity: 1, unitCents: line.amount, amountCents: line.amount })),
      ];
      const invoice: Invoice = {
        id: ids.newId(),
        bookingId,
        number: "",
        issuedOn: today(),
        billedTo: { ...booking.guest },
        lines,
        totalCents: lines.reduce((sum, line) => sum + line.amountCents, 0),
        vatCents: null,
        status: "issued",
        voidReason: null,
        voidedAt: null,
        createdBy: actor.id,
        createdAt: clock.now(),
      };
      const { number } = await store.issueInvoice(invoice);
      await record(actor, "invoice.issued", `Issued invoice ${number} for ${formatCents(invoice.totalCents)} on booking ${booking.ref}`, { type: "invoice", id: invoice.id });
      return done({ id: invoice.id, number });
    },

    async voidInvoice(actor: Actor, bookingId: string, invoiceId: string, input: unknown): Promise<ChangeResult> {
      access.assertCan(actor, "booking-money:manage");
      const parsed = parseWith(voidSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const invoice = await store.invoice(invoiceId);
      if (!invoice || invoice.bookingId !== bookingId || invoice.status === "void") return refusedWith("This invoice was already voided, or isn't on this booking. Reload the page.");
      if (!(await store.voidInvoice(invoiceId, clock.now(), parsed.value.reason))) return refusedWith("This invoice was already voided. Reload the page.");
      await record(actor, "invoice.voided", `Voided invoice ${invoice.number}: ${parsed.value.reason}`, { type: "invoice", id: invoiceId });
      return done();
    },

    /** An invoice and its booking, for the printable page. */
    async invoiceDocument(actor: Actor, bookingId: string, invoiceId: string): Promise<{ invoice: Invoice; booking: BookingForMoney } | null> {
      access.assertCan(actor, "booking-money:manage");
      const [invoice, booking] = await Promise.all([store.invoice(invoiceId), bookingOr(bookingId)]);
      return invoice && booking && invoice.bookingId === booking.id ? { invoice, booking } : null;
    },

    /** A received payment's receipt, with the booking's balance after it, for the printable page. */
    async receiptDocument(actor: Actor, bookingId: string, paymentId: string): Promise<{ payment: Payment; booking: BookingForMoney; summary: MoneySummary } | null> {
      access.assertCan(actor, "booking-money:manage");
      const [payment, booking] = await Promise.all([store.payment(paymentId), bookingOr(bookingId)]);
      if (!payment || !booking || payment.bookingId !== booking.id || !payment.receiptNumber) return null;
      return { payment, booking, summary: summaryOf(booking, await store.payments(bookingId)) };
    },

    /** A payment link for the booking (the deposit while it's owed, else the balance), as a waiting online payment. */
    async createCheckout(actor: Actor, bookingId: string, input: unknown): Promise<ChangeResult<{ checkoutUrl: string; providerRef: string }>> {
      access.assertCan(actor, "booking-money:manage");
      const gateway = deps.gateway;
      if (!gateway) return refusedWith("No payment gateway is set up yet; record payments as you receive them.");
      const parsed = parseWith(testCheckoutSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const booking = await bookingOr(bookingId);
      if (!booking) return refusedWith(bookingGone);
      const summary = summaryOf(booking, await store.payments(bookingId));
      if (parsed.value.amount > Math.max(0, summary.balanceCents)) return refused({ amount: `Ask for no more than the balance (${formatCents(Math.max(0, summary.balanceCents))}).` });
      const checkout = await gateway.createCheckout({ bookingId, ref: booking.ref, amountCents: parsed.value.amount, returnUrl: deps.returnUrlFor(bookingId) });
      const payment: Payment = {
        id: ids.newId(),
        bookingId,
        kind: summary.depositOutstandingCents > 0 ? "deposit" : "balance",
        method: "gateway",
        amountCents: parsed.value.amount,
        receivedOn: today(),
        reference: null,
        status: "pending",
        receiptNumber: null,
        providerRef: checkout.providerRef,
        idempotencyKey: null,
        recordedBy: actor.id,
        createdAt: clock.now(),
        voidedAt: null,
        voidReason: null,
      };
      if ((await store.recordPayment(payment)).status === "duplicate") return refusedWith("That payment link was already made. Reload the page.");
      await record(actor, "payment.link-created", `Payment link for ${formatCents(payment.amountCents)} on booking ${booking.ref}${gateway.testMode ? " (test mode)" : ""}`, {
        type: "payment",
        id: payment.id,
      });
      return done({ checkoutUrl: checkout.checkoutUrl, providerRef: checkout.providerRef });
    },

    /**
     * A webhook from the gateway, as its raw body: verified before anything
     * in it is trusted, recorded once (a replay changes nothing), then the
     * waiting payment it names is settled (with its receipt) or failed. The
     * answer says only how it was handled.
     */
    async handleWebhook(rawBody: string, headers: { get(name: string): string | null }): Promise<WebhookResult> {
      const gateway = deps.gateway;
      if (!gateway) return { status: "no-gateway" };
      const event = await gateway.verifyWebhook(rawBody, headers);
      if (!event.ok) return { status: "rejected" };
      const now = clock.now();
      const fresh = await store.recordWebhookEvent({ provider: gateway.name, providerEventId: event.id, receivedAt: now, payloadHash: deps.sha256(rawBody) });
      if (!fresh) return { status: "duplicate" };
      if (event.status === "failed") {
        const failed = await store.failGatewayPayment(event.providerRef);
        await store.setWebhookOutcome(gateway.name, event.id, failed ? "failed" : "not-found");
        return { status: failed ? "failed" : "ignored" };
      }
      const settlement = await store.settleGatewayPayment(event.providerRef, event.amountCents, now);
      await store.setWebhookOutcome(gateway.name, event.id, settlement.status);
      if (settlement.status !== "settled") return { status: "ignored" };
      const { payment } = settlement;
      await record(null, "payment.received-online", `Online ${paymentKindNames[payment.kind].toLowerCase()} of ${formatCents(payment.amountCents)} received (receipt ${payment.receiptNumber})`, {
        type: "payment",
        id: payment.id,
      });
      return { status: "settled" };
    },
  };
}

export type MoneyService = ReturnType<typeof createMoneyService>;
