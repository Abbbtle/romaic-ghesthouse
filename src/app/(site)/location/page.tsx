import type { Metadata } from "next";
import { PageBand, PageHeading } from "@/components/site/page-heading";
import { siteFactsOf } from "@/components/site/site-facts";
import { siteText } from "@/components/site/site-type";
import { ToConfirm } from "@/components/site/to-confirm";
import { buttonClasses } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { Paragraphs } from "@/components/ui/paragraphs";
import { VisuallyHidden, newTabHint } from "@/components/ui/visually-hidden";
import { getSiteContent } from "@/server/site-content";
import { pageMetadata } from "../page-metadata";

/** Read per request with the content as it is now, like every public page (see ../layout.tsx), so it may wait for it. */
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("location");
}

/**
 * Where the guesthouse is: the address large, as the approved design sets
 * it on the home page, with links that open the guest's own map app (no
 * embedded map, so no third party loads on the page), how to get here, and
 * the places nearby with distances marked as estimates.
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
      <PageBand spacing="head">
        <PageHeading title={location.heading} intro={location.intro} />
      </PageBand>
      <PageBand className="grid gap-y-14">
        <section aria-label="Address" className="grid gap-8 border-t border-hairline pt-10">
          <p className="font-display text-display font-light tracking-[-0.01em] text-ink">
            {site.address.street},<br />
            {facts.areaLine}
            {site.address.province && <span className="text-fg-2">, {site.address.province}</span>}
          </p>
          <ul aria-label="Open the address in a map app" className="flex flex-wrap gap-3">
            {mapApps.map((app) => (
              <li key={app.label}>
                <a href={app.href} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary", size: "md" })}>
                  {app.label}
                  <VisuallyHidden>{newTabHint}</VisuallyHidden>
                </a>
              </li>
            ))}
          </ul>
        </section>
        <div className="grid gap-x-16 gap-y-14 lg:grid-cols-12">
          {location.directions && (
            <section aria-labelledby="directions-title" className="grid content-start gap-5 border-t-2 border-romaic-gold pt-5 lg:col-span-5">
              <h2 id="directions-title" className={siteText.sub}>
                Getting here
              </h2>
              <Paragraphs text={location.directions} className={siteText.body} />
            </section>
          )}
          <section
            aria-labelledby="nearby-title"
            className={cx("grid content-start gap-5 border-t-2 border-romaic-gold pt-5", location.directions ? "lg:col-span-7" : "lg:col-span-12")}
          >
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <h2 id="nearby-title" className={siteText.sub}>
                {location.nearby.heading}
              </h2>
              {nearbyUnconfirmed && <ToConfirm />}
            </div>
            {location.nearby.places.length > 0 ? (
              <ul className="grid">
                {location.nearby.places.map((place) => (
                  <li key={place.name} className="grid gap-1 border-t border-hairline py-4 sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-6">
                    <div className="grid gap-0.5">
                      <p className="font-display text-title-sm text-ink">{place.name}</p>
                      <p className="text-[0.9375rem] text-fg-2">{place.kind}</p>
                    </div>
                    <div className="flex flex-wrap items-baseline gap-2 sm:justify-end">
                      {place.distance && (
                        <span className="text-ink" data-numeric>
                          {place.distance}
                        </span>
                      )}
                      {!place.confirmed && !nearbyUnconfirmed && <ToConfirm />}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-fg-3">Ask us about places nearby.</p>
            )}
            {location.nearby.note && <p className={siteText.secondary}>{location.nearby.note}</p>}
          </section>
        </div>
      </PageBand>
    </main>
  );
}
