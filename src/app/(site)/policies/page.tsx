import type { Metadata } from "next";
import { PageBand, PageHeading } from "@/components/site/page-heading";
import { siteText } from "@/components/site/site-type";
import { NotYetKnown, ToConfirm } from "@/components/site/to-confirm";
import { Paragraphs } from "@/components/ui/paragraphs";
import { businessTimeLabel } from "@/lib/format/date-time";
import type { TimeWindow } from "@/lib/content/schema";
import { getSiteContent } from "@/server/site-content";
import { pageMetadata } from "../page-metadata";

/** Read per request with the content as it is now, like every public page (see ../layout.tsx), so it may wait for it. */
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("policies");
}

function Window({ title, window, tagged }: { title: string; window: TimeWindow; tagged: boolean }) {
  return (
    <div className="grid content-start gap-2 border-t-2 border-romaic-gold pt-5">
      <h3 className={siteText.titleSm}>{title}</h3>
      <p className="font-display text-display-sm font-light text-ink" data-numeric>
        {window.from} to {window.until} <span className="font-sans text-base font-normal text-fg-2">{businessTimeLabel}</span>
      </p>
      {tagged && !window.confirmed && <ToConfirm className="justify-self-start" />}
    </div>
  );
}

const terms = [
  { key: "deposit", title: "Deposit" },
  { key: "balance", title: "Paying the balance" },
  { key: "cancellation", title: "Cancelling" },
  { key: "payment", title: "How to pay" },
] as const;

/** A titled list of terms or rules: the title on the left from 640 px, the words on the right, over hairlines. */
const rowClasses = "grid gap-2 border-t border-hairline py-5 sm:grid-cols-[14rem_1fr] sm:gap-8";

/**
 * Check-in and check-out times, the house rules, and the direct-booking
 * terms. A term the owner hasn't set yet says so plainly rather than
 * guessing; a rule from the Booking.com listing is marked "To confirm".
 */
export default async function PoliciesPage() {
  const { policies, bookingTerms } = await getSiteContent();
  // A group whose facts are all unconfirmed gets one tag by its heading; a mixed group tags each unconfirmed fact.
  const timesUnconfirmed = !policies.checkIn.confirmed && !policies.checkOut.confirmed;
  const rulesUnconfirmed = policies.rules.every((rule) => !rule.confirmed);
  return (
    <main id="main" className="flex-1">
      <PageBand spacing="head">
        <PageHeading title={policies.heading} intro={policies.intro} />
      </PageBand>
      <PageBand className="grid gap-16">
        <section aria-labelledby="times-title" className="grid gap-6">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <h2 id="times-title" className={siteText.sub}>
              Arriving and leaving
            </h2>
            {timesUnconfirmed && <ToConfirm />}
          </div>
          <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2">
            <Window title="Check-in" window={policies.checkIn} tagged={!timesUnconfirmed} />
            <Window title="Check-out" window={policies.checkOut} tagged={!timesUnconfirmed} />
          </div>
        </section>

        <section aria-labelledby="rules-title" className="grid gap-6">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <h2 id="rules-title" className={siteText.sub}>
              House rules
            </h2>
            {rulesUnconfirmed && <ToConfirm />}
          </div>
          <dl className="grid border-b border-hairline">
            {policies.rules.map((rule) => (
              <div key={rule.title} className={rowClasses}>
                <dt className="grid content-start justify-items-start gap-2 font-display text-title-sm text-ink">
                  {rule.title}
                  {!rule.confirmed && !rulesUnconfirmed && <ToConfirm />}
                </dt>
                <dd>
                  <Paragraphs text={rule.text} className={siteText.body} />
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="terms-title" className="grid gap-6">
          <h2 id="terms-title" className={siteText.sub}>
            Booking terms
          </h2>
          <dl className="grid border-b border-hairline">
            {terms.map((term) => (
              <div key={term.key} className={rowClasses}>
                <dt className="font-display text-title-sm text-ink">{term.title}</dt>
                <dd>{bookingTerms[term.key] ? <Paragraphs text={bookingTerms[term.key]} className={siteText.body} /> : <NotYetKnown />}</dd>
              </div>
            ))}
          </dl>
        </section>
      </PageBand>
    </main>
  );
}
