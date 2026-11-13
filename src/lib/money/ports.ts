import type { Actor } from "@/lib/kernel/actor";
import type { BookingForMoney, Invoice, Payment } from "./money";

/**
 * What booking money needs from the outside world. Adapters implement these
 * (Postgres, the test gateway; in-memory ones in ./testing); src/server
 * wires them in. Every write is one atomic command; receipt and invoice
 * numbers are drawn in the same transaction as the record that gets them,
 * so they never repeat or skip.
 */

/** Reads a booking for its money: total, deposit, guest, stay. */
export interface BookingReader {
  booking(id: string): Promise<BookingForMoney | null>;
}

export type PaymentRecording =
  | { status: "recorded"; receiptNumber: string | null }
  /** A payment with this idempotency key or gateway reference is already recorded: nothing changed. */
  | { status: "duplicate" }
  /** A refund larger than what's been paid (net of refunds) when it came to be stored: nothing changed. */
  | { status: "over-refund"; paidCents: number };

export type GatewaySettlement =
  | { status: "settled"; payment: Payment }
  /** No waiting online payment has this gateway reference. */
  | { status: "not-found" }
  /** The gateway says a different amount was paid than was asked for: nothing changed. */
  | { status: "amount-mismatch"; payment: Payment }
  /** It was settled (or failed) already: nothing changed. */
  | { status: "already-final"; payment: Payment };

export type WebhookEventRecord = {
  provider: string;
  providerEventId: string;
  receivedAt: Date;
  /** A SHA-256 of the raw body, so the event can be matched later without keeping its contents. */
  payloadHash: string;
};

export interface MoneyStore {
  payments(bookingId: string): Promise<Payment[]>;
  payment(id: string): Promise<Payment | null>;
  invoices(bookingId: string): Promise<Invoice[]>;
  invoice(id: string): Promise<Invoice | null>;
  /**
   * Stores a payment; a received one gets the next receipt number (the
   * `receiptNumber` passed is ignored). Refused as a duplicate when its
   * idempotency key or gateway reference is already used. A refund is
   * checked against what's been paid at the moment it's stored, with the
   * booking locked, so two refunds at once can't add up to more.
   */
  recordPayment(payment: Payment): Promise<PaymentRecording>;
  /** Voids a payment that isn't voided yet; false when there's no such payment, or it's voided. */
  voidPayment(id: string, at: Date, reason: string): Promise<boolean>;
  /** Stores an invoice with the next invoice number (the `number` passed is ignored); answers with the number. */
  issueInvoice(invoice: Invoice): Promise<{ number: string }>;
  voidInvoice(id: string, at: Date, reason: string): Promise<boolean>;
  /** Marks a waiting online payment received with the next receipt number, if the amount matches, all at once. */
  settleGatewayPayment(providerRef: string, amountCents: number, at: Date): Promise<GatewaySettlement>;
  /** Marks a waiting online payment failed. False when there's no waiting one. */
  failGatewayPayment(providerRef: string): Promise<boolean>;
  /** Records a verified webhook event once: false when its id was seen before (a replay or a retry). */
  recordWebhookEvent(event: WebhookEventRecord): Promise<boolean>;
  /** Notes what came of an event: "settled", "failed", "not-found", "amount-mismatch", "already-final". */
  setWebhookOutcome(provider: string, providerEventId: string, outcome: string): Promise<void>;
}

export type CheckoutRequest = { bookingId: string; ref: string; amountCents: number; returnUrl: string };

export type Checkout = { providerRef: string; checkoutUrl: string };

/** A webhook the gateway signed: what it says happened to a payment. */
export type VerifiedEvent = { ok: true; id: string; providerRef: string; status: "paid" | "failed"; amountCents: number };

export type WebhookRefusal = { ok: false; reason: "bad-signature" | "stale" | "malformed" };

/**
 * An online payment provider. Only a test adapter exists: choosing a real
 * gateway (PayFast, Yoco, Peach Payments, Paystack…) is the owner's
 * decision and needs approval (open question #11).
 */
export interface PaymentGateway {
  /** A short name for logs and the webhook record: "test". */
  readonly name: string;
  /** Whether this is the test adapter (the dashboard says so, and offers to simulate a payment). */
  readonly testMode: boolean;
  createCheckout(request: CheckoutRequest): Promise<Checkout>;
  /** Checks a webhook's signature and freshness against its raw body, before anything in it is trusted. */
  verifyWebhook(rawBody: string, headers: { get(name: string): string | null }): Promise<VerifiedEvent | WebhookRefusal>;
}

export type MoneyPermission = "booking-money:manage" | "refunds:issue";

export interface MoneyAccess {
  can(actor: Actor, permission: MoneyPermission): boolean;
  assertCan(actor: Actor, permission: MoneyPermission): void;
}
