import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import { ApartmentCard } from "@/components/site/apartment-card";
import { apartmentSummaryOf } from "@/components/site/apartment-summary";
import { PageBand, PageHeading } from "@/components/site/page-heading";
import { dockAfterId } from "@/components/site/site-dock";
import { ButtonLink } from "@/components/ui/button";
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
 * Every room type the site offers, as cards with the same anatomy in the
 * same places, so guests can compare who each sleeps and on what beds.
 * Each opens its own page; "Check dates" opens the Book page.
 */
export default async function ApartmentsPage() {
  const [{ apartments }, fromPrices] = await Promise.all([getSiteContent(), nightlyFromPrices()]);
  const offered = apartments.items.filter((item) => item.published);
  return (
    <main id="main" className="flex-1">
      <PageBand tone="cream">
        <PageHeading title={apartments.heading} intro={apartments.intro}>
          <div id={dockAfterId}>
            <ButtonLink href={sitePagePaths.book} size="lg" icon={<CalendarDays aria-hidden="true" strokeWidth={1.75} className="size-5" />}>
              Check dates and availability
            </ButtonLink>
          </div>
        </PageHeading>
      </PageBand>
      <PageBand>
        <h2 className="sr-only">All rooms</h2>
        <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {offered.map((apartment) => (
            <ApartmentCard key={apartment.slug} apartment={apartmentSummaryOf(apartment, fromPrices[apartment.slug] ?? null)} />
          ))}
        </div>
      </PageBand>
    </main>
  );
}
