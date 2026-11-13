"use client";

import { FileText, Receipt } from "lucide-react";
import Link from "next/link";
import { TextField } from "@/components/ui/fields";
import { Notice } from "@/components/ui/notice";
import { cx } from "@/components/ui/cx";
import type { FormAction } from "@/lib/forms/form-state";
import { ActionForm } from "../action-form";
import { ConfirmButton, type ConfirmedActionResult } from "../confirm-button";
import { Panel } from "../panel";
import { StatusPill, type StatusTone } from "../status-pill";
import { useToast } from "../toast";
import { IssueInvoiceForm } from "./issue-invoice-form";
import { RecordPaymentForm } from "./record-payment-form";
import { VoidButton } from "./void-button";

/** A payment as the list shows it, worded and formatted on the server. */
export type PaymentRow = {
  id: string;
  /** "Deposit by EFT". */
  title: string;
  /** "R600.00", or "−R200.00" for a refund. */
  amount: string;
  /** "Received Thu 12 Nov · RG-B2C3D". */
  detail: string;
  status: { label: string; tone: StatusTone };
  receipt: { number: string; href: string } | null;
  voidReason: string | null;
  canVoid: boolean;
  /** For the void question: "the R600.00 deposit". */
  subject: string;
  /** Test mode: an online payment still waiting, which can be acted out. */
  testPending: boolean;
};

export type InvoiceRow = {
  id: string;
  number: string;
  /** "Issued Thu 12 Nov 2026 · R2,550.00". */
  detail: string;
  status: { label: string; tone: StatusTone };
  href: string;
  voidReason: string | null;
  canVoid: boolean;
};

export type MoneyFigures = {
  total: string;
  depositDue: string;
  /** "R100.00 of it still to pay", or "Paid". */
  depositNote: string;
  paid: string;
  /** "R60.00 refunded", when there are refunds. */
  paidNote: string | null;
  balance: string;
  /** "Still to pay", "Settled", or "Overpaid by R50.00". */
  balanceNote: string;
};

type IdAction = (bookingId: string, id: string, reason: string) => Promise<ConfirmedActionResult>;

/** One line of the ledger: what it is on the left, the amount right-aligned in tabular figures. */
function LedgerLine({ label, value, note, strong = false }: { label: string; value: string; note?: string | null; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3 lg:px-5">
      <dt className={strong ? "font-bold text-ink" : "text-fg-2"}>
        {label}
        {note && <span className="block text-xs font-normal text-fg-3">{note}</span>}
      </dt>
      <dd className={cx("text-right tabular-nums", strong ? "text-h4 font-bold text-ink" : "text-base text-ink")} data-numeric>
        {value}
      </dd>
    </div>
  );
}

/**
 * A booking's money (Pattern: detail): what it comes to and what's still
 * owed, every payment with its receipt, recording one received by hand, the
 * invoices and issuing one, and, in test mode only, a pretend payment link.
 * Mistakes are voided, never deleted.
 */
export function MoneyScreen({
  bookingId,
  figures,
  payments,
  invoices,
  stayLine,
  today,
  canRefund,
  defaultKind,
  firstKey,
  gateway,
  testCheckoutRef,
  suggestedLinkAmount,
  suggestedAmounts,
  actions,
}: {
  bookingId: string;
  figures: MoneyFigures;
  payments: readonly PaymentRow[];
  invoices: readonly InvoiceRow[];
  stayLine: { description: string; amount: string };
  today: string;
  canRefund: boolean;
  defaultKind: "deposit" | "balance";
  firstKey: string;
  gateway: { ready: boolean; testMode: boolean };
  /** Test mode: the payment link the page was opened from, standing in for the gateway's checkout. */
  testCheckoutRef: string | null;
  suggestedLinkAmount: string;
  /** What each kind of payment would most likely be, to fill in the amount: the deposit still owed, and the balance. */
  suggestedAmounts: { deposit: string; balance: string };
  actions: {
    recordPayment: FormAction;
    voidPayment: IdAction;
    issueInvoice: FormAction;
    voidInvoice: IdAction;
    createTestPaymentLink: FormAction;
    actOutTestPayment: (bookingId: string, paymentId: string, outcome: "paid" | "failed") => Promise<ConfirmedActionResult>;
  };
}) {
  const toasts = useToast();
  const shown = (message: string) => () => toasts?.show({ message });

  return (
    <div className="grid max-w-admin gap-6">
      <section aria-labelledby="money-summary-title" className="grid gap-3">
        <h2 id="money-summary-title" className="sr-only">
          What it comes to
        </h2>
        {/* A ledger, as the receipt reads: total, what's paid, what's left. */}
        <div className="max-w-xl rounded-md border border-hairline bg-white">
          <dl className="divide-y divide-hairline">
            <LedgerLine label="Total for the stay" value={figures.total} />
            <LedgerLine label="Paid so far" value={figures.paid} note={figures.paidNote} />
            <LedgerLine label={figures.balanceNote === "Still to pay" ? "Balance still to pay" : figures.balanceNote} value={figures.balance} strong />
          </dl>
          <p className="border-t border-hairline px-4 py-2.5 text-sm text-fg-2 lg:px-5">
            Deposit <span className="tabular-nums" data-numeric>{figures.depositDue}</span> · {figures.depositNote}
          </p>
        </div>
        {!gateway.ready && <Notice tone="info">No payment gateway is set up yet; record payments as you receive them.</Notice>}
        {gateway.testMode && (
          <Notice tone="warning" title="Test mode">
            Payment links on this page are pretend: no money moves, and no guest is asked to pay.
          </Notice>
        )}
        {gateway.testMode && testCheckoutRef && (
          <Notice tone="info" title="The test checkout">
            This is where a guest would pay online for link {testCheckoutRef}. Act out the payment arriving, or failing, from the payments list.
          </Notice>
        )}
      </section>

      <Panel title="Payments" description="Money received for this booking, each with its numbered receipt. A mistake is voided: it stays on record, crossed out.">
        {payments.length > 0 ? (
          <ul className="grid divide-y divide-hairline rounded-md border border-hairline">
            {payments.map((payment) => (
              <li key={payment.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className={cx("grid gap-0.5", payment.voidReason && "text-fg-3")}>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={cx("font-bold tabular-nums", payment.voidReason ? "line-through" : "text-ink")}>{payment.amount}</span>
                    <span className={cx(payment.voidReason ? "line-through" : "text-ink")}>{payment.title}</span>
                    <StatusPill tone={payment.status.tone}>{payment.status.label}</StatusPill>
                  </p>
                  <p className="text-sm text-fg-2">{payment.detail}</p>
                  {payment.voidReason && <p className="text-sm text-fg-2">Voided: {payment.voidReason}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {payment.receipt && (
                    <Link href={payment.receipt.href} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-link underline underline-offset-4">
                      <Receipt aria-hidden="true" strokeWidth={1.75} className="size-4" />
                      Receipt {payment.receipt.number}
                    </Link>
                  )}
                  {payment.testPending && (
                    <>
                      <ConfirmButton
                        size="sm"
                        variant="secondary"
                        tone="primary"
                        title="Act out this test payment arriving?"
                        description="The test gateway reports it as paid, the same way a real one would. It's received, with a receipt. No money moves."
                        confirmLabel="It's paid"
                        pendingLabel="Working…"
                        action={() => actions.actOutTestPayment(bookingId, payment.id, "paid")}
                        onDone={shown("Test payment received")}
                      >
                        Act out payment
                      </ConfirmButton>
                      <ConfirmButton
                        size="sm"
                        variant="ghost"
                        tone="primary"
                        title="Act out this test payment failing?"
                        description="The test gateway reports it as failed. Nothing is received."
                        confirmLabel="It failed"
                        pendingLabel="Working…"
                        action={() => actions.actOutTestPayment(bookingId, payment.id, "failed")}
                        onDone={shown("Test payment marked as failed")}
                      >
                        Act out a failure
                      </ConfirmButton>
                    </>
                  )}
                  {payment.canVoid && (
                    <VoidButton
                      subject={payment.subject}
                      description="It stays on this booking, crossed out, and stops counting towards what's paid. Its receipt number isn't used again."
                      action={(reason) => actions.voidPayment(bookingId, payment.id, reason)}
                      onDone={shown("Payment voided")}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-hairline px-4 py-3 text-sm text-fg-3">No payments yet.</p>
        )}
      </Panel>

      <Panel title="Record a payment" description="For money you've received: cash, the card machine, an EFT, or a booking site that collected it for you.">
        <RecordPaymentForm
          bookingId={bookingId}
          action={actions.recordPayment}
          today={today}
          canRefund={canRefund}
          defaultKind={defaultKind}
          firstKey={firstKey}
          suggestedAmounts={suggestedAmounts}
        />
      </Panel>

      <Panel title="Invoices" description="Each is numbered in order and billed to the guest as they were on the day. A wrong one is voided and a new one issued.">
        {invoices.length > 0 ? (
          <ul className="grid divide-y divide-hairline rounded-md border border-hairline">
            {invoices.map((invoice) => (
              <li key={invoice.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className={cx("grid gap-0.5", invoice.voidReason && "text-fg-3")}>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={cx("font-mono font-bold tracking-wide", invoice.voidReason ? "line-through" : "text-ink")}>{invoice.number}</span>
                    <StatusPill tone={invoice.status.tone}>{invoice.status.label}</StatusPill>
                  </p>
                  <p className="text-sm text-fg-2">{invoice.detail}</p>
                  {invoice.voidReason && <p className="text-sm text-fg-2">Voided: {invoice.voidReason}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Link href={invoice.href} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-link underline underline-offset-4">
                    <FileText aria-hidden="true" strokeWidth={1.75} className="size-4" />
                    View or print
                  </Link>
                  {invoice.canVoid && (
                    <VoidButton
                      subject={`invoice ${invoice.number}`}
                      description="It stays on record, marked void, and its number isn't used again. Issue a new one if the guest still needs an invoice."
                      action={(reason) => actions.voidInvoice(bookingId, invoice.id, reason)}
                      onDone={shown("Invoice voided")}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-hairline px-4 py-3 text-sm text-fg-3">No invoices yet.</p>
        )}
      </Panel>

      <Panel title="Issue an invoice" description="The stay comes first at the booking's total. Add lines for anything else agreed, like laundry.">
        <IssueInvoiceForm bookingId={bookingId} action={actions.issueInvoice} stayLine={stayLine} />
      </Panel>

      {gateway.testMode && (
        <Panel title="Create a test payment link" description="Practise taking a payment online. The link waits under Payments until you act out the payment arriving. No money moves.">
          <ActionForm action={actions.createTestPaymentLink} footer="button" submitLabel="Create test link" pendingLabel="Creating…" subject="this test link" resetOnSave>
            <input type="hidden" name="bookingId" value={bookingId} />
            <TextField name="amount" label="Amount (R)" inputMode="decimal" autoComplete="off" maxLength={16} defaultValue={suggestedLinkAmount} hint="No more than the balance." />
          </ActionForm>
        </Panel>
      )}
    </div>
  );
}
