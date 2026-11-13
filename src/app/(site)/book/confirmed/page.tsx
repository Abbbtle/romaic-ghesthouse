import { CircleCheck, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageBand } from "@/components/site/page-heading";
import { siteFactsOf, whatsappWith } from "@/components/site/site-facts";
import { siteText } from "@/components/site/site-type";
import { buttonClasses } from "@/components/ui/button";
import { Paragraphs } from "@/components/ui/paragraphs";
import { WhatsAppButton } from "@/components/ui/whatsapp-button";
import { sitePagePaths } from "@/lib/content/pages";
import { stayLabel } from "@/lib/inventory/stays";
import { readReceipt } from "@/server/booking-receipts";
import { getSiteContent } from "@/server/site-content";

/** Read per request with the content as it is now, like every public page (see ../layout.tsx), so it may wait for it. */
export const instant = false;

export const metadata: Metadata = {
  title: { absolute: "Request sent – Romaic Guesthouse" },
  robots: { index: false, follow: false },
};

/**
 * After a request is sent: the reference to quote, what was asked for, what
 * happens next, and a WhatsApp link that opens with the reference. The
 * details come from the signed receipt in the address (nothing personal is
 * in it); an address without a genuine receipt shows the next steps only.
 */
export default async function BookingConfirmedPage({ searchParams }: PageProps<"/book/confirmed">) {
  const { r } = await searchParams;
  const receipt = readReceipt(Array.isArray(r) ? r[0] : r);
  const content = await getSiteContent();
  const { book, apartments } = content;
  const facts = siteFactsOf(content);
  const apartment = receipt ? apartments.items.find((item) => item.slug === receipt.apartment) : undefined;
  const whatsapp = receipt ? whatsappWith(facts, `Hi, about my booking request ${receipt.ref}.`) : facts.whatsapp;

  return (
    <main id="main" className="flex-1">
      <PageBand spacing="band">
        <div className="grid max-w-form justify-items-start gap-7">
          <CircleCheck aria-hidden="true" strokeWidth={1} className="size-14 text-success-700" />
          <h1 className={siteText.page}>{book.confirmation.heading}</h1>
          {receipt && (
            <dl className="grid w-full gap-x-8 sm:grid-cols-2">
              <div className="grid gap-1 border-t border-hairline py-4 sm:col-span-2">
                <dt className={siteText.label}>Your reference</dt>
                <dd className="font-mono text-h2 font-bold tracking-[0.12em] text-ink">{receipt.ref}</dd>
              </div>
              {apartment && (
                <div className="grid gap-1 border-t border-hairline py-4">
                  <dt className={siteText.label}>Room</dt>
                  <dd className="text-ink">{apartment.name}</dd>
                </div>
              )}
              <div className="grid gap-1 border-t border-hairline py-4">
                <dt className={siteText.label}>Your stay</dt>
                <dd className="text-ink" data-numeric>
                  {stayLabel({ arrive: receipt.arrive, leave: receipt.leave })}, {receipt.guests} {receipt.guests === 1 ? "guest" : "guests"}
                </dd>
              </div>
            </dl>
          )}
          {book.confirmation.text && <Paragraphs text={book.confirmation.text} className={siteText.lede} />}
          <div className="flex w-full flex-wrap gap-3">
            <WhatsAppButton href={whatsapp} size="lg" className="w-full sm:w-auto">
              WhatsApp us
            </WhatsAppButton>
            <a href={facts.phone.tel} className={buttonClasses({ variant: "secondary", size: "lg" }, "w-full sm:w-auto")}>
              <Phone aria-hidden="true" strokeWidth={1.5} className="size-5" />
              <span data-numeric>Call {facts.phone.display}</span>
            </a>
          </div>
          <Link href={sitePagePaths.home} className={siteText.link}>
            Back to the home page
          </Link>
        </div>
      </PageBand>
    </main>
  );
}
