import { ArrowRight, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AmenityIconGlyph } from "@/components/site/amenity-icon";
import { ApartmentCard } from "@/components/site/apartment-card";
import { apartmentSummaryOf } from "@/components/site/apartment-summary";
import { ContentPhoto } from "@/components/site/content-photo";
import { DatesSearch } from "@/components/site/dates-search";
import { GoldBarHeading } from "@/components/site/gold-bar-heading";
import { siteFactsOf } from "@/components/site/site-facts";
import { dockAfterId } from "@/components/site/site-dock";
import { jsonLdText, lodgingBusinessData } from "@/components/site/structured-data";
import { buttonClasses } from "@/components/ui/button";
import { textStyles } from "@/components/ui/typography";
import { Paragraphs } from "@/components/ui/paragraphs";
import { VisuallyHidden, whatsappHint } from "@/components/ui/visually-hidden";
import { sitePagePaths } from "@/lib/content/pages";
import { env } from "@/server/env";
import { nightlyFromPrices } from "@/server/rates";
import { inventoryService } from "@/server/stays";
import { getSiteContent } from "@/server/site-content";
import { pageMetadata } from "./page-metadata";

/** Read per request with the content as it is now, like every public page (see ../layout.tsx), so it may wait for it. */
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("home");
}

/**
 * The home page, the classic accommodation page in the client's poster
 * recipe: the gold-framed photo, the headline in the gold bar, the address,
 * and the dates-and-guests search as the first screen's working action;
 * then the apartments, what keeps working, and where to find us. Every word
 * and photo comes from the site's content.
 */
export default async function HomePage() {
  const [content, fromPrices] = await Promise.all([getSiteContent(), nightlyFromPrices()]);
  const { home, apartments } = content;
  const facts = siteFactsOf(content);
  const offered = apartments.items.filter((item) => item.published);
  /** The home page shows the first few; the Apartments page compares them all. */
  const featured = offered.slice(0, 3);
  const largestGroup = Math.max(1, ...offered.map((item) => item.sleeps));
  const today = inventoryService().today();

  return (
    <main id="main" className="flex-1">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(lodgingBusinessData(content, env.siteUrl())) }} />

      <section aria-labelledby="hero-title" className="bg-cream">
        <div className="mx-auto grid max-w-page grid-cols-[minmax(0,1fr)] gap-8 px-[max(1rem,env(safe-area-inset-left))] pt-6 pb-section-sm sm:gap-10 lg:grid-cols-12 lg:items-start lg:gap-14 lg:pt-14">
          {/* The warm, gold-framed photo leads (brand guide p10): an inset on phones, the right 7/12 on desktop. */}
          {/* From 1024 px the frame runs the full height of the text column beside it, so no Cream gap opens under it. */}
          {/* That frame is taller than it is wide, so a landscape photo fills it at about twice the column's width: sizes asks for that much, so it stays sharp. */}
          {/* On tablets the photo is 16:9, so the dates search still starts on the first screen. */}
          <div className="lg:order-last lg:col-span-7 lg:self-stretch">
            <ContentPhoto image={home.hero.photo} preload sizes="(min-width: 1024px) 80rem, calc(100vw - 2rem)" className="sm:aspect-video lg:aspect-auto lg:h-full lg:min-h-[28rem]" />
          </div>
          <div className="grid gap-6 text-center lg:col-span-5 lg:text-left">
            <GoldBarHeading as="h1" size="hero" sweep>
              <span id="hero-title">{home.hero.headline}</span>
            </GoldBarHeading>
            <p className="font-display text-sm font-semibold tracking-[0.24em] text-ink uppercase sm:text-base">{facts.addressLine}</p>
            {/* On phones, and on laptop screens under about 900 px tall, the search follows the address, inside the first screen; the lead and welcome come after it. */}
            <p className="order-1 mx-auto max-w-[52ch] text-lead text-fg-2 lg:mx-0 [@media(min-width:64rem)_and_(min-height:56rem)]:order-none">{home.hero.lead}</p>
            {home.hero.welcome && (
              <p className={`${textStyles.script} order-1 -my-1 [@media(min-width:64rem)_and_(min-height:56rem)]:order-none`} lang="en">
                {home.hero.welcome}
              </p>
            )}
            <div id={dockAfterId} className="grid gap-3 text-left">
              <DatesSearch action={sitePagePaths.book} today={today} maxGuests={largestGroup} />
              <p className="text-center text-sm text-fg-2 lg:text-left">
                Or{" "}
                <a href={facts.whatsapp} target="_blank" rel="noopener noreferrer" className="font-bold text-link underline underline-offset-4 hover:text-link-hover">
                  WhatsApp us
                  <VisuallyHidden>{whatsappHint}</VisuallyHidden>
                </a>{" "}
                or call{" "}
                <a href={facts.phone.tel} className="font-bold whitespace-nowrap text-link underline underline-offset-4 hover:text-link-hover" data-numeric>
                  {facts.phone.display}
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="apartments-title" className="bg-canvas">
        <div className="mx-auto grid max-w-page gap-10 px-[max(1rem,env(safe-area-inset-left))] py-section-sm">
          <div className="grid gap-3">
            <h2 id="apartments-title" className={textStyles.h2}>
              {home.apartments.heading}
            </h2>
            {home.apartments.intro && <Paragraphs text={home.apartments.intro} className={textStyles.lead} />}
          </div>
          <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((apartment) => (
              <ApartmentCard key={apartment.slug} apartment={apartmentSummaryOf(apartment, fromPrices[apartment.slug] ?? null)} />
            ))}
          </div>
          <p>
            <Link href={sitePagePaths.apartments} className="inline-flex min-h-11 items-center gap-2 font-bold text-link underline underline-offset-4 hover:text-link-hover">
              {offered.length > featured.length ? `See all ${offered.length} apartments` : "Compare the apartments"}
              <ArrowRight aria-hidden="true" strokeWidth={1.75} className="size-4" />
            </Link>
          </p>
        </div>
      </section>

      <section aria-labelledby="highlights-title" className="bg-cream">
        <div className="mx-auto grid max-w-page gap-8 px-[max(1rem,env(safe-area-inset-left))] py-section-sm">
          <div className="grid gap-3">
            <h2 id="highlights-title" className={textStyles.h2}>
              {home.highlights.heading}
            </h2>
            {home.highlights.intro && <Paragraphs text={home.highlights.intro} className={textStyles.lead} />}
          </div>
          {/* Below 360 px the panel and icon column tighten, so a long capitalised word ("Connectivity") still fits a 320 px screen. */}
          <div className="marble border-4 border-romaic-gold p-4 shadow-2 min-[360px]:p-6 sm:p-8">
            <ul className="grid divide-y divide-romaic-gold/60 lg:auto-cols-fr lg:grid-flow-col lg:divide-x lg:divide-y-0">
              {home.highlights.items.map((item) => (
                <li key={item.title} className="grid grid-cols-[2.5rem_1fr] items-start gap-4 py-5 first:pt-0 last:pb-0 min-[360px]:grid-cols-[3rem_1fr] min-[360px]:gap-5 lg:px-6 lg:py-0 lg:first:pl-0 lg:last:pr-0">
                  <AmenityIconGlyph icon={item.icon} className="size-10 text-gold-text min-[360px]:size-11" />
                  <div className="grid gap-1.5 border-l border-romaic-gold pl-5">
                    <h3 className="font-display text-h4 font-semibold tracking-[0.14em] text-ink uppercase">{item.title}</h3>
                    {item.lines.map((line) => (
                      <p key={line} className="text-base text-fg-2">
                        {line}
                      </p>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <p>
            <Link href={sitePagePaths.facilities} className="inline-flex min-h-11 items-center gap-2 font-bold text-link underline underline-offset-4 hover:text-link-hover">
              See all our facilities
              <ArrowRight aria-hidden="true" strokeWidth={1.75} className="size-4" />
            </Link>
          </p>
        </div>
      </section>

      <section aria-labelledby="where-title" className="bg-canvas">
        <div className="mx-auto grid max-w-page gap-6 px-[max(1rem,env(safe-area-inset-left))] py-section-sm sm:grid-cols-[auto_1fr] sm:items-start sm:gap-10">
          <MapPin aria-hidden="true" strokeWidth={1.25} className="size-12 text-gold-text" />
          <div className="grid gap-3">
            <h2 id="where-title" className={textStyles.h2}>
              {home.location.heading}
            </h2>
            <p className="text-lead font-bold text-ink">{facts.addressLine}</p>
            {home.location.text && <Paragraphs text={home.location.text} className={textStyles.lead} />}
            <ul className="flex flex-wrap gap-x-8 gap-y-1">
              <li>
                <a href={facts.mapLink} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 font-bold text-link underline underline-offset-4 hover:text-link-hover">
                  Open in Google Maps
                  <VisuallyHidden>(opens in a new tab)</VisuallyHidden>
                </a>
              </li>
              <li>
                <Link href={sitePagePaths.location} className="inline-flex min-h-11 items-center gap-2 font-bold text-link underline underline-offset-4 hover:text-link-hover">
                  What&rsquo;s nearby
                  <ArrowRight aria-hidden="true" strokeWidth={1.75} className="size-4" />
                </Link>
              </li>
              <li>
                <a href={facts.phone.tel} className="inline-flex min-h-11 items-center gap-2 font-bold text-link underline underline-offset-4 hover:text-link-hover">
                  <Phone aria-hidden="true" strokeWidth={1.5} className="size-4" />
                  <span data-numeric>Call {facts.phone.display}</span>
                </a>
              </li>
            </ul>
            {/* The page ends on its booking action, in the header's words. On phones the booking dock already carries it. */}
            <p className="mt-3 hidden lg:block">
              <Link href={sitePagePaths.book} className={buttonClasses({ variant: "primary", size: "lg" })}>
                Check dates
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
