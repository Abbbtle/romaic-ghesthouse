import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminRoutes } from "@/components/admin/admin-routes";
import { MoneyScreen, type InvoiceRow, type MoneyFigures, type PaymentRow } from "@/components/admin/money/money-screen";
import { PageHeader } from "@/components/admin/page-header";
import type { StatusTone } from "@/components/admin/status-pill";
import { formatDayLong, formatDayShort } from "@/lib/format/date-time";
import { centsForInput, formatCents } from "@/lib/format/money";
import { businessTimeZone, zonedToday } from "@/lib/format/zoned-time";
import { stayLabel } from "@/lib/inventory/stays";
import { paymentKindNames, paymentMethodNames, paymentStatusNames, type MoneySummary, type Payment, type PaymentStatus } from "@/lib/money/money";
import { stayLine, type MoneyAccount } from "@/lib/money/money-service";
import { requireDashboardActor } from "@/server/admin-session";
import { clock, ids } from "@/server/infrastructure";
import { moneyService } from "@/server/money";
import { actOutTestPayment, createTestPaymentLink, issueInvoice, recordPayment, voidInvoice, voidPayment } from "./actions";

export const metadata: Metadata = { title: "Payments and invoices" };

const statusTones: Record<PaymentStatus, StatusTone> = { received: "success", pending: "warning", failed: "danger" };

const dayLabel = (day: string) => `${formatDayShort(day)} ${day.slice(0, 4)}`;

function paymentTitle(payment: Payment): string {
  if (payment.method === "gateway") return `${paymentKindNames[payment.kind]} online`;
  return `${paymentKindNames[payment.kind]} by ${paymentMethodNames[payment.method]}`;
}

function paymentDetail(payment: Payment): string {
  const parts =
    payment.status === "received"
      ? [`Received ${dayLabel(payment.receivedOn)}`]
      : payment.status === "pending"
        ? [`Link made ${dayLabel(payment.receivedOn)}, waiting for the guest to pay`]
        : ["The online payment didn't go through"];
  if (payment.reference) parts.push(payment.reference);
  return parts.join(" · ");
}

function paymentRows(account: MoneyAccount): PaymentRow[] {
  const bookingPath = `${adminRoutes.bookings}/${account.booking.id}`;
  return account.payments.map((payment) => {
    const amount = formatCents(payment.kind === "refund" ? -payment.amountCents : payment.amountCents);
    return {
      id: payment.id,
      title: paymentTitle(payment),
      amount,
      detail: paymentDetail(payment),
      status: payment.voidedAt ? { label: "Voided", tone: "neutral" } : { label: paymentStatusNames[payment.status], tone: statusTones[payment.status] },
      receipt: payment.receiptNumber && !payment.voidedAt ? { number: payment.receiptNumber, href: `${bookingPath}/receipts/${payment.id}` } : null,
      voidReason: payment.voidReason,
      canVoid: !payment.voidedAt && payment.status !== "failed" && (payment.kind !== "refund" || account.canRefund),
      subject: `the ${formatCents(payment.amountCents)} ${paymentKindNames[payment.kind].toLowerCase()}`,
      testPending: account.gateway.testMode && payment.method === "gateway" && payment.status === "pending" && !payment.voidedAt,
    };
  });
}

function invoiceRows(account: MoneyAccount): InvoiceRow[] {
  const bookingPath = `${adminRoutes.bookings}/${account.booking.id}`;
  return account.invoices.map((invoice) => ({
    id: invoice.id,
    number: invoice.number,
    detail: `Issued ${formatDayLong(invoice.issuedOn)} · ${formatCents(invoice.totalCents)}`,
    status: invoice.status === "void" ? { label: "Void", tone: "neutral" } : { label: "Issued", tone: "info" },
    href: `${bookingPath}/invoices/${invoice.id}`,
    voidReason: invoice.voidReason,
    canVoid: invoice.status === "issued",
  }));
}

function figuresOf(summary: MoneySummary): MoneyFigures {
  return {
    total: formatCents(summary.totalCents),
    depositDue: formatCents(summary.depositDueCents),
    depositNote: summary.depositDueCents === 0 ? "None asked for" : summary.depositOutstandingCents > 0 ? `${formatCents(summary.depositOutstandingCents)} still to pay` : "Paid",
    paid: formatCents(summary.paidCents),
    paidNote: summary.refundedCents > 0 ? `After ${formatCents(summary.refundedCents)} refunded` : null,
    balance: formatCents(Math.max(0, summary.balanceCents)),
    balanceNote: summary.balanceCents > 0 ? "Still to pay" : summary.balanceCents === 0 ? "Settled" : `Overpaid by ${formatCents(-summary.balanceCents)}`,
  };
}

/** The test gateway's link references, as it makes them: anything else in the address is ignored. */
const testCheckoutPattern = /^test_[0-9a-f]{24}$/;

/**
 * A booking's payments, receipts and invoices, for the owner and sales
 * (booking-money:manage); refunds for the owner only. Never admin or staff.
 */
export default async function BookingMoneyPage({ params, searchParams }: PageProps<"/admin/bookings/[id]/money">) {
  const actor = await requireDashboardActor({ permission: "booking-money:manage" });
  const { id } = await params;
  const query = await searchParams;
  const account = await moneyService().account(actor, id);
  if (!account) notFound();
  const { booking, summary } = account;
  const line = stayLine(booking);
  const checkoutRef = typeof query["test-checkout"] === "string" && testCheckoutPattern.test(query["test-checkout"]) ? query["test-checkout"] : null;
  const owed = summary.depositOutstandingCents > 0 ? summary.depositOutstandingCents : Math.max(0, summary.balanceCents);

  return (
    <>
      <PageHeader
        title="Payments and invoices"
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-bold text-ink">{booking.guest.name}</span>
            <span className="font-mono font-bold tracking-wider">{booking.ref}</span>
            <span>
              {booking.apartmentName} ({booking.unitName}), {stayLabel(booking.stay)}
            </span>
          </span>
        }
        back={{ href: `${adminRoutes.bookings}/${booking.id}`, label: "Booking" }}
      />
      <MoneyScreen
        bookingId={booking.id}
        figures={figuresOf(summary)}
        payments={paymentRows(account)}
        invoices={invoiceRows(account)}
        stayLine={{ description: line.description, amount: formatCents(line.amountCents) }}
        today={zonedToday(clock.now(), businessTimeZone)}
        canRefund={account.canRefund}
        defaultKind={summary.depositOutstandingCents > 0 ? "deposit" : "balance"}
        suggestedAmounts={{
          deposit: summary.depositOutstandingCents > 0 ? centsForInput(summary.depositOutstandingCents) : "",
          balance: summary.balanceCents > 0 ? centsForInput(summary.balanceCents) : "",
        }}
        firstKey={ids.newId()}
        gateway={account.gateway}
        testCheckoutRef={checkoutRef}
        suggestedLinkAmount={owed > 0 ? centsForInput(owed) : ""}
        actions={{ recordPayment, voidPayment, issueInvoice, voidInvoice, createTestPaymentLink, actOutTestPayment }}
      />
    </>
  );
}
