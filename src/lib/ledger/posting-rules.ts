import type { IsoDate } from "@/lib/format/zoned-time";
import { paymentKindNames, paymentMethodNames, type Payment } from "@/lib/money/money";
import { cashAccountFor, systemAccounts } from "./accounts";
import { bookingParty, type JournalDraft, type JournalLine } from "./journals";
import type { BookingForLedger, LedgerSettings } from "./ports";

/**
 * How bookings' money becomes journals. Income is recognised when the guest
 * checks out (the default until the owner's accountant decides: build-plan,
 * "When accommodation income is recognised"). Until then, money received is
 * a deposit held for the guest (a liability); at check-out the stay becomes
 * income and a receivable, and the deposits held move across to settle it.
 * Each booking's deposits and receivable are kept by party, "booking:<id>".
 */

const line = (accountCode: string, side: "debit" | "credit", cents: number, party: string | null, memo: string | null = null): JournalLine => ({
  accountCode,
  debitCents: side === "debit" ? cents : 0,
  creditCents: side === "credit" ? cents : 0,
  party,
  memo,
});

/** The guest's side of a payment: a deposit until check-out, the receivable from then on. */
function guestAccount(booking: BookingForLedger, on: IsoDate): string {
  return booking.checkedOutOn !== null && booking.checkedOutOn <= on ? systemAccounts.guestReceivables : systemAccounts.guestDeposits;
}

/** A payment received (or refunded), on its day. Null for one that isn't received or is for nothing. */
export function paymentDraft(payment: Payment, booking: BookingForLedger, settings: LedgerSettings): JournalDraft | null {
  if (payment.status !== "received" || payment.amountCents <= 0) return null;
  const party = bookingParty(booking.id);
  const cash = cashAccountFor(payment.method, booking.channel, settings.mainBank);
  const guest = guestAccount(booking, payment.receivedOn);
  const refund = payment.kind === "refund";
  return {
    date: payment.receivedOn,
    memo: `${paymentKindNames[payment.kind]} for ${booking.ref} by ${paymentMethodNames[payment.method].toLowerCase()}${payment.receiptNumber ? ` (${payment.receiptNumber})` : ""}`,
    source: { type: "payment", id: payment.id, part: "received" },
    lines: refund
      ? [line(guest, "debit", payment.amountCents, party), line(cash, "credit", payment.amountCents, null)]
      : [line(cash, "debit", payment.amountCents, null), line(guest, "credit", payment.amountCents, party)],
  };
}

/** The stay (and any invoiced extras) become income on the check-out day, owed by the guest. */
export function checkOutDraft(booking: BookingForLedger): JournalDraft | null {
  if (booking.checkedOutOn === null) return null;
  const total = booking.totalCents + booking.extrasCents;
  if (total <= 0) return null;
  const party = bookingParty(booking.id);
  const lines = [line(systemAccounts.guestReceivables, "debit", total, party)];
  if (booking.totalCents > 0) lines.push(line(systemAccounts.accommodation, "credit", booking.totalCents, null));
  if (booking.extrasCents > 0) lines.push(line(systemAccounts.otherIncome, "credit", booking.extrasCents, null, "Invoiced extras"));
  return { date: booking.checkedOutOn, memo: `Stay ${booking.ref}: income at check-out`, source: { type: "booking", id: booking.id, part: "check-out" }, lines };
}

/**
 * Moves what's held as a checked-out booking's deposits across to settle its
 * receivable: `heldCents` is the deposits account's credit balance for the
 * booking (negative when a correction left it debit).
 */
export function depositTransferDraft(booking: BookingForLedger, heldCents: number, date: IsoDate, sequence: number): JournalDraft | null {
  if (heldCents === 0) return null;
  const party = bookingParty(booking.id);
  const cents = Math.abs(heldCents);
  return {
    date,
    memo: `Deposits for ${booking.ref} applied to the stay`,
    source: { type: "booking", id: booking.id, part: `transfer:${sequence}` },
    lines:
      heldCents > 0
        ? [line(systemAccounts.guestDeposits, "debit", cents, party), line(systemAccounts.guestReceivables, "credit", cents, party)]
        : [line(systemAccounts.guestReceivables, "debit", cents, party), line(systemAccounts.guestDeposits, "credit", cents, party)],
  };
}
