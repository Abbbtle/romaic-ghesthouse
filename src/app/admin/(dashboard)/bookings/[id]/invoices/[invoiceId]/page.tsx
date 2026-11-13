import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { PrintButton } from "@/components/admin/money/print-button";
import { DocumentFact, issuerOf, PrintableDocument } from "@/components/admin/money/printable-document";
import { formatDayLong } from "@/lib/format/date-time";
import { formatCents } from "@/lib/format/money";
import { formatPhoneNumber } from "@/lib/format/phone";
import { requireDashboardActor } from "@/server/admin-session";
import { moneyPath, moneyService } from "@/server/money";
import { getSiteContent } from "@/server/site-content";

export const metadata: Metadata = { title: "Invoice" };

/**
 * An invoice as a page to print or save as a PDF: the business from the
 * site's content, the number and date, who it's billed to (as they were when
 * it was issued), its lines and total. No VAT. For the owner and sales
 * (booking-money:manage).
 */
export default async function InvoicePage({ params }: PageProps<"/admin/bookings/[id]/invoices/[invoiceId]">) {
  const actor = await requireDashboardActor({ permission: "booking-money:manage" });
  const { id, invoiceId } = await params;
  const document = await moneyService().invoiceDocument(actor, id, invoiceId);
  if (!document) notFound();
  const [content, requestHeaders] = await Promise.all([getSiteContent(), headers()]);
  const { invoice, booking } = document;
  const { billedTo } = invoice;

  return (
    <>
      <PageHeader title={`Invoice ${invoice.number}`} back={{ href: moneyPath(booking.id), label: "Payments and invoices" }} actions={<PrintButton />} />
      <div className="grid max-w-admin gap-6">
        <PrintableDocument
          nonce={requestHeaders.get("x-nonce") ?? undefined}
          issuer={issuerOf(content)}
          title="Invoice"
          number={invoice.number}
          voided={invoice.status === "void" ? (invoice.voidReason ?? "Voided") : null}
          facts={
            <>
              <DocumentFact label="Date">{formatDayLong(invoice.issuedOn)}</DocumentFact>
              <DocumentFact label="Booking">{booking.ref}</DocumentFact>
              <DocumentFact label="Billed to">
                <span className="grid">
                  <span className="font-bold">{billedTo.name}</span>
                  {billedTo.phone && <span>{formatPhoneNumber(billedTo.phone)}</span>}
                  {billedTo.email && <span className="break-all">{billedTo.email}</span>}
                </span>
              </DocumentFact>
            </>
          }
        >
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">What the invoice is for</caption>
            <thead>
              <tr className="border-b border-ink text-left">
                <th scope="col" className="py-2 pr-4 font-bold">
                  Description
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-bold">
                  Qty
                </th>
                <th scope="col" className="py-2 text-right font-bold">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line, index) => (
                <tr key={index} className="border-b border-hairline align-top">
                  <td className="py-2.5 pr-4">{line.description}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{line.quantity}</td>
                  <td className="py-2.5 text-right tabular-nums">{formatCents(line.amountCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={2} className="pt-4 pr-4 text-right text-base font-bold">
                  Total
                </th>
                <td className="pt-4 text-right text-base font-bold tabular-nums">{formatCents(invoice.totalCents)}</td>
              </tr>
            </tfoot>
          </table>
        </PrintableDocument>
      </div>
    </>
  );
}
