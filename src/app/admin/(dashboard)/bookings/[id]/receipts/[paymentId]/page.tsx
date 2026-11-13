import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { PrintButton } from "@/components/admin/money/print-button";
import { DocumentFact, issuerOf, PrintableDocument } from "@/components/admin/money/printable-document";
import { formatDayLong } from "@/lib/format/date-time";
import { formatCents } from "@/lib/format/money";
import { stayLabel } from "@/lib/inventory/stays";
import { paymentKindNames, paymentMethodNames } from "@/lib/money/money";
import { requireDashboardActor } from "@/server/admin-session";
import { moneyPath, moneyService } from "@/server/money";
import { getSiteContent } from "@/server/site-content";

export const metadata: Metadata = { title: "Receipt" };

/**
 * A received payment's receipt as a page to print or save as a PDF: the
 * business from the site's content, the receipt number and date, who paid,
 * what for and how, and where the booking's account stands today. For the
 * owner and sales (booking-money:manage).
 */
export default async function ReceiptPage({ params }: PageProps<"/admin/bookings/[id]/receipts/[paymentId]">) {
  const actor = await requireDashboardActor({ permission: "booking-money:manage" });
  const { id, paymentId } = await params;
  const document = await moneyService().receiptDocument(actor, id, paymentId);
  const receiptNumber = document?.payment.receiptNumber;
  if (!document || !receiptNumber) notFound();
  const [content, requestHeaders] = await Promise.all([getSiteContent(), headers()]);
  const { payment, booking, summary } = document;
  const refund = payment.kind === "refund";

  return (
    <>
      <PageHeader title={`Receipt ${receiptNumber}`} back={{ href: moneyPath(booking.id), label: "Payments and invoices" }} actions={<PrintButton />} />
      <div className="grid max-w-admin gap-6">
        <PrintableDocument
          nonce={requestHeaders.get("x-nonce") ?? undefined}
          issuer={issuerOf(content)}
          title={refund ? "Refund receipt" : "Receipt"}
          number={receiptNumber}
          voided={payment.voidedAt ? (payment.voidReason ?? "Voided") : null}
          facts={
            <>
              <DocumentFact label={refund ? "Refunded on" : "Received on"}>{formatDayLong(payment.receivedOn)}</DocumentFact>
              <DocumentFact label="Booking">{booking.ref}</DocumentFact>
              <DocumentFact label={refund ? "Refunded to" : "Received from"}>
                <span className="font-bold">{booking.guest.name}</span>
              </DocumentFact>
              <DocumentFact label={refund ? "Paid back by" : "Paid by"}>
                {payment.method === "gateway" ? "Online payment" : paymentMethodNames[payment.method]}
                {payment.reference && <span className="text-fg-2"> · {payment.reference}</span>}
              </DocumentFact>
            </>
          }
        >
          <div className="grid gap-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-y border-ink py-4">
              <p className="text-sm">
                <span className="font-bold">{paymentKindNames[payment.kind]}</span> for {booking.apartmentName}, {stayLabel(booking.stay)}
              </p>
              <p className="text-h3 font-bold tabular-nums">{formatCents(payment.amountCents)}</p>
            </div>
            <dl className="grid max-w-sm gap-2 text-sm sm:ml-auto sm:w-full">
              <div className="flex justify-between gap-4">
                <dt>Total for the stay</dt>
                <dd className="tabular-nums">{formatCents(summary.totalCents)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Paid so far</dt>
                <dd className="tabular-nums">{formatCents(summary.paidCents)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-hairline pt-2 font-bold">
                <dt>Balance still to pay</dt>
                <dd className="tabular-nums">{formatCents(Math.max(0, summary.balanceCents))}</dd>
              </div>
            </dl>
          </div>
        </PrintableDocument>
      </div>
    </>
  );
}
