import { MapPin, Navigation } from "lucide-react";
import type { Metadata } from "next";
import { PageBand, PageHeading } from "@/components/site/page-heading";
import { siteFactsOf } from "@/components/site/site-facts";
import { ToConfirm } from "@/components/site/to-confirm";
import { Paragraphs } from "@/components/ui/paragraphs";
import { textStyles } from "@/components/ui/typography";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { getSiteContent } from "@/server/site-content";
import { pageMetadata } from "../page-metadata";

/** Read per request with the content as it is now, like every public page (see ../layout.tsx), so it may wait for it. */
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("location");
}

/**
 * Where the guesthouse is: the address, links that open the guest's own map
 * app (no embedded map, so no third party loads on the page), how to get
 * here, and the places nearby with distances marked as estimates.
 */
export default async function LocationPage() {
  const content = await getSiteContent();
  const { location, site } = content;
  const facts = siteFactsOf(content);
  // One tag by the heading when no place is confirmed; otherwise a tag on each unconfirmed one.
  const nearbyUnconfirmed = location.nearby.places.length > 0 && location.nearby.places.every((place) => !place.confirmed);
  const query = encodeURIComponent([site.address.street, site.address.area, site.address.city, site.address.province].filter(Boolean).join(", "));
  const mapApps = [
    { label: "Google Maps", href: facts.mapLink },
    { label: "Apple Maps", href: `https://maps.apple.com/?q=${query}` },
    { label: "Waze", href: `https://waze.com/ul?q=${query}&navigate=yes` },
  ];
  return (
    <main id="main" className="flex-1">
      <PageBand tone="cream">
        <PageHeading title={location.heading} intro={location.intro}>
          <p className="flex items-start gap-3 text-lead font-bold text-ink">
            <MapPin aria-hidden="true" strokeWidth={1.5} className="mt-1 size-6 shrink-0 text-gold-text" />
            {facts.addressLine}
            {site.address.province && `, ${site.address.province}`}
          </p>
          <ul aria-label="Open the address in a map app" className="flex flex-wrap gap-3">
            {mapApps.map((app) => (
              <li key={app.label}>
                <a
                  href={app.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-2 rounded-sm border-[1.5px] border-ink bg-white px-4 text-sm font-bold text-ink hover:bg-chalk"
                >
                  <Navigation aria-hidden="true" strokeWidth={1.5} className="size-4" />
                  {app.label}
                  <VisuallyHidden>(opens in a new tab)</VisuallyHidden>
                </a>
              </li>
            ))}
          </ul>
        </PageHeading>
      </PageBand>
      <PageBand className="grid gap-12 lg:grid-cols-12">
        {location.directions && (
          <section aria-labelledby="directions-title" className="grid content-start gap-4 lg:col-span-5">
            <h2 id="directions-title" className={textStyles.h2}>
              Getting here
            </h2>
            <Paragraphs text={location.directions} className={textStyles.body} />
          </section>
        )}
        <section aria-labelledby="nearby-title" className={location.directions ? "grid content-start gap-4 lg:col-span-7" : "grid content-start gap-4 lg:col-span-12"}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h2 id="nearby-title" className={textStyles.h2}>
              {location.nearby.heading}
            </h2>
            {nearbyUnconfirmed && <ToConfirm />}
          </div>
          {location.nearby.places.length > 0 ? (
            <ul className="grid border-t border-romaic-gold/60">
              {location.nearby.places.map((place) => (
                <li key={place.name} className="grid gap-1 border-b border-romaic-gold/60 py-4 sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-6">
                  <div className="grid gap-1">
                    <p className="text-base font-bold text-ink">{place.name}</p>
                    <p className="text-sm text-fg-2">{place.kind}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {place.distance && (
                      <span className="text-base text-ink" data-numeric>
                        {place.distance}
                      </span>
                    )}
                    {!place.confirmed && !nearbyUnconfirmed && <ToConfirm />}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-base text-fg-3">Ask us about places nearby.</p>
          )}
          {location.nearby.note && <p className={textStyles.secondary}>{location.nearby.note}</p>}
        </section>
      </PageBand>
    </main>
  );
}
