import type { ReactNode } from "react";
import { LogoSlot } from "@/components/ui/logo-slot";
import type { SiteContent } from "@/lib/content/schema";
import { formatPhoneNumber } from "@/lib/format/phone";

/**
 * Printing shows only the document: everything else on the page (the
 * dashboard's navigation, this page's header and buttons) is left out, and
 * the elements around the document lose their padding and borders. The
 * dashboard's policy only runs <style> elements carrying its nonce.
 */
const printCss = `
@media print {
  @page { margin: 14mm; }
  html, body { background: #fff !important; }
  body *:not(:has([data-print-document])):not([data-print-document]):not([data-print-document] *) { display: none !important; }
  body *:has([data-print-document]) {
    display: block !important; position: static !important; margin: 0 !important; padding: 0 !important; border: 0 !important;
    background: none !important; box-shadow: none !important; overflow: visible !important; height: auto !important;
    min-height: 0 !important; max-width: none !important; width: auto !important;
  }
  [data-print-document] { border: 0 !important; padding: 0 !important; box-shadow: none !important; max-width: none !important; }
}
`;

/** Who the document is from, as the site's content says. */
export type DocumentIssuer = {
  businessName: string;
  addressLines: string[];
  phone: string | null;
  email: string | null;
};

/** The business's name, address, phone and email from the site's content (Website › Business details and Contact). */
export function issuerOf(content: Pick<SiteContent, "site" | "contact">): DocumentIssuer {
  const { address } = content.site;
  const town = [address.city, address.postalCode].filter(Boolean).join(" ");
  return {
    businessName: content.site.businessName,
    addressLines: [address.street, address.area, town, address.province].filter((line): line is string => Boolean(line)),
    phone: content.contact.phone || null,
    email: content.contact.email || null,
  };
}

/** One labelled fact on the document: "Date", "Billed to". */
export function DocumentFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs font-bold tracking-wide text-fg-3 uppercase">{label}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  );
}

/**
 * A receipt or invoice laid out as a page: the business (with a slot where
 * the logo goes once it arrives), the document's name and number, its facts
 * and body, and a thank-you. A voided one says so across the top. It never
 * shows VAT: the business isn't VAT-registered (open question #1).
 */
export function PrintableDocument({
  nonce,
  issuer,
  title,
  number,
  voided,
  facts,
  children,
}: {
  nonce: string | undefined;
  issuer: DocumentIssuer;
  /** "Invoice", "Receipt". */
  title: string;
  number: string;
  /** Why it was voided, or null. */
  voided: string | null;
  facts: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <style nonce={nonce}>{printCss}</style>
      <article data-print-document className="grid max-w-[52rem] gap-8 rounded-md border border-hairline bg-white p-5 text-ink sm:p-10">
        {voided && (
          <p className="rounded-sm border-2 border-danger px-4 py-3 text-sm font-bold text-danger-fg">
            VOID: {voided}. This {title.toLowerCase()} no longer counts.
          </p>
        )}
        <header className="flex flex-wrap items-start justify-between gap-6">
          <LogoSlot kind="wordmark" />
          <div className="grid gap-0.5 text-sm sm:text-right">
            <p className="text-base font-bold">{issuer.businessName}</p>
            {issuer.addressLines.map((line, index) => (
              <p key={index} className="text-fg-2">
                {line}
              </p>
            ))}
            {issuer.phone && <p className="text-fg-2">{formatPhoneNumber(issuer.phone)}</p>}
            {issuer.email && <p className="break-all text-fg-2">{issuer.email}</p>}
          </div>
        </header>
        <div className="grid gap-1">
          <h2 className="text-h2 font-bold">{title}</h2>
          <p className="font-mono text-base font-bold tracking-wide">{number}</p>
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">{facts}</dl>
        {children}
        <p className="border-t border-hairline pt-6 text-base font-bold">Thank you for staying with us.</p>
      </article>
    </>
  );
}
