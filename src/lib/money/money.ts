import type { IsoDate } from "@/lib/format/zoned-time";
import type { Stay } from "@/lib/inventory/stays";

/**
 * Booking money: payments received against a booking, the receipts they
 * get, and invoices. Everything is in integer cents (ZAR), and nothing is
 * ever deleted: a payment or invoice entered by mistake is voided, with a
 * reason, and stays in the record (SARS keeps five years of records; the
 * ledger arrives in Phase 4).
 *
 * The business is treated as not VAT-registered until the owner says
 * otherwise (open question #1): invoices carry no VAT and say nothing
 * about it.
 */

export const paymentKinds = ["deposit", "balance", "extra", "refund"] as const;
export type PaymentKind = (typeof paymentKinds)[number];
export const paymentKindNames: Record<PaymentKind, string> = {
  deposit: "Deposit",
  balance: "Balance",
  extra: "Extras",
  refund: "Refund",
};

export const paymentMethods = ["cash", "card-machine", "eft", "gateway", "channel-collected"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];
export const paymentMethodNames: Record<PaymentMethod, string> = {
  cash: "Cash",
  "card-machine": "Card machine",
  eft: "EFT",
  gateway: "Online payment",
  "channel-collected": "Collected by the channel",
};

/** The methods someone can record by hand; online payments come from the gateway. */
export const manualPaymentMethods = ["cash", "card-machine", "eft", "channel-collected"] as const satisfies readonly PaymentMethod[];

export const paymentStatuses = ["received", "pending", "failed"] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];
export const paymentStatusNames: Record<PaymentStatus, string> = { received: "Received", pending: "Waiting", failed: "Failed" };

export type Payment = {
  id: string;
  bookingId: string;
  kind: PaymentKind;
  method: PaymentMethod;
  /** Always positive; a refund reduces what's been paid. */
  amountCents: number;
  receivedOn: IsoDate;
  /** An EFT reference, a card slip number, the channel's payout reference. */
  reference: string | null;
  status: PaymentStatus;
  /** "RC-000001": issued when the payment is received, never reused. */
  receiptNumber: string | null;
  /** The gateway's own reference for an online payment. */
  providerRef: string | null;
  /** Stops the same payment being recorded twice (a double-tap, a retried request). */
  idempotencyKey: string | null;
  recordedBy: string | null;
  createdAt: Date;
  voidedAt: Date | null;
  voidReason: string | null;
};

export type InvoiceLine = { description: string; quantity: number; unitCents: number; amountCents: number };

export type BilledTo = { name: string; phone: string | null; email: string | null };

export const invoiceStatuses = ["issued", "void"] as const;
export type InvoiceStatus = (typeof invoiceStatuses)[number];

export type Invoice = {
  id: string;
  bookingId: string;
  /** "INV-000001": sequential, never reused; a corrected invoice gets a new number. */
  number: string;
  issuedOn: IsoDate;
  billedTo: BilledTo;
  lines: InvoiceLine[];
  totalCents: number;
  /** Always null while the business isn't VAT-registered. */
  vatCents: null;
  status: InvoiceStatus;
  voidReason: string | null;
  voidedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
};

/** A booking as money sees it: what's owed, by whom, for what. */
export type BookingForMoney = {
  id: string;
  ref: string;
  status: string;
  apartmentName: string;
  unitName: string;
  stay: Stay;
  adults: number;
  children: number;
  totalCents: number;
  depositDueCents: number;
  guest: BilledTo;
};

export type MoneySummary = {
  totalCents: number;
  depositDueCents: number;
  /** Received payments, less received refunds; voided entries don't count. */
  paidCents: number;
  refundedCents: number;
  /** What's still owed; negative when more has been paid than the total. */
  balanceCents: number;
  /** How much of the deposit is still owed. */
  depositOutstandingCents: number;
};

/** Whether a payment counts towards what's been paid: received, and not voided. */
export function counts(payment: Pick<Payment, "status" | "voidedAt">): boolean {
  return payment.status === "received" && payment.voidedAt === null;
}

export function summaryOf(booking: Pick<BookingForMoney, "totalCents" | "depositDueCents">, payments: readonly Payment[]): MoneySummary {
  const counted = payments.filter(counts);
  const received = counted.filter((payment) => payment.kind !== "refund").reduce((sum, payment) => sum + payment.amountCents, 0);
  const refunded = counted.filter((payment) => payment.kind === "refund").reduce((sum, payment) => sum + payment.amountCents, 0);
  const paid = received - refunded;
  return {
    totalCents: booking.totalCents,
    depositDueCents: booking.depositDueCents,
    paidCents: paid,
    refundedCents: refunded,
    balanceCents: booking.totalCents - paid,
    depositOutstandingCents: Math.max(0, booking.depositDueCents - paid),
  };
}

/** "RC-000042" from 42; "INV-000042" from 42. */
export function formatNumber(prefix: "RC" | "INV", value: number): string {
  return `${prefix}-${String(value).padStart(6, "0")}`;
}
