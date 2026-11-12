import { CircleCheck, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { GoldBarHeading } from "@/components/site/gold-bar-heading";
import { PageBand } from "@/components/site/page-heading";
import { siteFactsOf, whatsappWith } from "@/components/site/site-facts";
import { buttonClasses } from "@/components/ui/button";
import { Paragraphs } from "@/components/ui/paragraphs";
import { textStyles } from "@/components/ui/typography";
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
      <PageBand tone="cream">
        <div className="grid max-w-form justify-items-start gap-6">
        <CircleCheck aria-hidden="true" strokeWidth={1.25} className="size-14 text-success-700" />
        <GoldBarHeading as="h1" size="hero">
          {book.confirmation.heading}
        </GoldBarHeading>
        {receipt && (
          <dl className="grid w-full gap-4 border-y border-romaic-gold/60 py-5">
            <div className="grid gap-1">
              <dt className="text-sm font-bold text-fg-3">Your reference</dt>
              <dd className="font-mono text-h2 font-bold tracking-[0.12em] text-ink">{receipt.ref}</dd>
            </div>
            {apartment && (
              <div className="grid gap-1">
                <dt className="text-sm font-bold text-fg-3">Apartment</dt>
                <dd className="text-base text-ink">{apartment.name}</dd>
              </div>
            )}
            <div className="grid gap-1">
              <dt className="text-sm font-bold text-fg-3">Your stay</dt>
              <dd className="text-base text-ink" data-numeric>
                {stayLabel({ arrive: receipt.arrive, leave: receipt.leave })}, {receipt.guests} {receipt.guests === 1 ? "guest" : "guests"}
              </dd>
            </div>
          </dl>
        )}
        {book.confirmation.text && <Paragraphs text={book.confirmation.text} className={textStyles.lead} />}
        <div className="flex w-full flex-wrap gap-3">
          <WhatsAppButton href={whatsapp} size="lg" className="w-full sm:w-auto">
            WhatsApp us
          </WhatsAppButton>
          <a href={facts.phone.tel} className={buttonClasses({ variant: "secondary", size: "lg" }, "w-full sm:w-auto")}>
            <Phone aria-hidden="true" strokeWidth={1.5} className="size-5" />
            <span data-numeric>Call {facts.phone.display}</span>
          </a>
        </div>
        <Link href={sitePagePaths.home} className="inline-flex min-h-11 items-center font-bold text-link underline underline-offset-4 hover:text-link-hover">
          Back to the home page
        </Link>
        </div>
      </PageBand>
    </main>
  );
}
