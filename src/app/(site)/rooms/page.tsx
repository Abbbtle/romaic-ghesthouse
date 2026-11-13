import type { Metadata } from "next";
import { ApartmentCard } from "@/components/site/apartment-card";
import { apartmentSummaryOf } from "@/components/site/apartment-summary";
import { PageBand, PageHeading } from "@/components/site/page-heading";
import { dockAfterId } from "@/components/site/site-dock";
import { ButtonLink } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { sitePagePaths } from "@/lib/content/pages";
import { nightlyFromPrices } from "@/server/rates";
import { getSiteContent } from "@/server/site-content";
import { pageMetadata } from "../page-metadata";

/** Read per request with the content as it is now, like every public page (see ../layout.tsx), so it may wait for it. */
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("apartments");
}

/**
 * Every room type the site offers, as the approved design's room cards with
 * the same parts in the same places, so guests can compare who each sleeps,
 * on what beds and from what price. Large photos, two to a row; with an odd
 * number of rooms the first runs the full width with its words beside it,
 * so no card is left alone at the end. Each opens its own page; "Check
 * availability" opens the Book page.
 */
export default async function ApartmentsPage() {
  const [{ apartments }, fromPrices] = await Promise.all([getSiteContent(), nightlyFromPrices()]);
  const offered = apartments.items.filter((item) => item.published);
  const featureFirst = offered.length % 2 === 1 && offered.length > 1;
  return (
    <main id="main" className="flex-1">
      <PageBand spacing="head">
        <PageHeading title={apartments.heading} intro={apartments.intro}>
          <div id={dockAfterId}>
            <ButtonLink href={sitePagePaths.book} size="lg">
              Check availability
            </ButtonLink>
          </div>
        </PageHeading>
      </PageBand>
      <PageBand>
        <h2 className="sr-only">All rooms</h2>
        <div className="grid gap-x-8 gap-y-14 min-[40rem]:grid-cols-2 min-[67.5rem]:gap-x-12">
          {offered.map((apartment, index) => (
            <ApartmentCard
              key={apartment.slug}
              apartment={apartmentSummaryOf(apartment, fromPrices[apartment.slug] ?? null)}
              layout={featureFirst && index === 0 ? "feature" : "standard"}
              className={cx(featureFirst && index === 0 && "min-[40rem]:col-span-full")}
            />
          ))}
        </div>
      </PageBand>
    </main>
  );
}
