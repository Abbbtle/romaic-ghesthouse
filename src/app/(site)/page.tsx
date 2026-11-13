import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ApartmentCard } from "@/components/site/apartment-card";
import { apartmentSummaryOf } from "@/components/site/apartment-summary";
import { ContentPhoto, FramedPhoto } from "@/components/site/content-photo";
import { DatesSearch } from "@/components/site/dates-search";
import { siteFactsOf, type SiteFacts } from "@/components/site/site-facts";
import { dockAfterId } from "@/components/site/site-dock";
import { siteText } from "@/components/site/site-type";
import { StandInCaption } from "@/components/site/stand-in-photo";
import { jsonLdText, lodgingBusinessData } from "@/components/site/structured-data";
import { ToConfirm } from "@/components/site/to-confirm";
import { buttonClasses } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { Paragraphs } from "@/components/ui/paragraphs";
import { VisuallyHidden, newTabHint, whatsappHint } from "@/components/ui/visually-hidden";
import { sitePagePaths } from "@/lib/content/pages";
import { standInSource, type ImageRef, type TimeWindow } from "@/lib/content/schema";
import { businessTimeLabel } from "@/lib/format/date-time";
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

/** A delay for the hero's entrance, as the custom property .hero-rise reads. */
function riseDelay(seconds: number): CSSProperties {
  return { "--rise-delay": `${seconds}s` } as CSSProperties;
}

/**
 * The hero's photograph, full bleed under navy gradients: from the top for
 * the header, and from the bottom and the left for the address, headline
 * and introduction, so they stay legible whatever photo the owner chooses.
 * It settles once on load, never under reduced motion. A stand-in says so
 * quietly at the bottom right, above where the availability bar overlaps.
 */
function HeroPhoto({ image }: { image: ImageRef }) {
  const source = standInSource(image.src);
  return (
    <figure data-placeholder={source ? "photo" : undefined} className="@container absolute inset-0 m-0">
      <Image
        src={image.src}
        alt={image.alt}
        fill
        preload
        sizes="100vw"
        className="hero-settle object-cover"
        style={{ objectPosition: `${image.focus.x}% ${image.focus.y}%` }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(0deg,rgb(10_17_25/0.92)_0%,rgb(10_17_25/0.6)_55%,rgb(10_17_25/0.35)_100%)] min-[56.25rem]:bg-[linear-gradient(180deg,rgb(10_17_25/0.72)_0%,rgb(10_17_25/0)_22%),linear-gradient(0deg,rgb(10_17_25/0.86)_0%,rgb(10_17_25/0.4)_46%,rgb(10_17_25/0)_75%),linear-gradient(90deg,rgb(10_17_25/0.62)_0%,rgb(10_17_25/0.3)_40%,rgb(10_17_25/0)_65%)]"
      />
      {source && <StandInCaption source={source} placement="custom" className="absolute right-[max(var(--spacing-gutter),env(safe-area-inset-right))] bottom-[5.25rem] text-on-navy-2" />}
    </figure>
  );
}

/** One of the "Getting here" blocks: a gold rule, a title, then its words. */
function VisitBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-2 border-t-2 border-romaic-gold pt-5">
      <h3 className={siteText.titleSm}>{title}</h3>
      <div className="grid gap-2 text-[0.9375rem] leading-normal text-fg-2">{children}</div>
    </div>
  );
}

/** A house time on navy: what it is on the left, when on the right, marked if the owner hasn't confirmed it. */
function TimeRow({ label, value, window }: { label: string; value: string; window: TimeWindow }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-t border-hairline py-4">
      <dt>{label}</dt>
      <dd className="grid justify-items-end gap-1 text-right text-fg-2">
        <span data-numeric>
          {value} <span className="text-[0.8125rem]">{businessTimeLabel}</span>
        </span>
        {!window.confirmed && <ToConfirm />}
      </dd>
    </div>
  );
}

/** "Or WhatsApp us or call 076 957 9928": the booking alternatives in a sentence. */
function OrMessageUs({ facts, className }: { facts: SiteFacts; className?: string }) {
  return (
    <p className={className}>
      Or{" "}
      <a href={facts.whatsapp} target="_blank" rel="noopener noreferrer" className={siteText.link}>
        WhatsApp us
        <VisuallyHidden>{whatsappHint}</VisuallyHidden>
      </a>{" "}
      or call{" "}
      <a href={facts.phone.tel} className={cx(siteText.link, "whitespace-nowrap")} data-numeric>
        {facts.phone.display}
      </a>
    </p>
  );
}

/**
 * The home page in the approved premium design, "a gold-town guesthouse
 * after dark": the full-bleed photograph with the address, headline and
 * introduction, and the availability bar over its foot; the house and what
 * keeps working, beside a framed photo; every room, the first large, two
 * stacked beside it and the rest in a row, each with its nightly price from
 * the rates or "Price on request"; the navy evening band with the house
 * times; the address as the heading of "Getting here"; and a closing
 * invitation to book. Every word and photo comes from the site's content.
 */
export default async function HomePage() {
  const [content, fromPrices] = await Promise.all([getSiteContent(), nightlyFromPrices()]);
  const { home, apartments, policies, location, contactPage, book, site } = content;
  const facts = siteFactsOf(content);
  const offered = apartments.items.filter((item) => item.published);
  const cards = offered.map((apartment) => apartmentSummaryOf(apartment, fromPrices[apartment.slug] ?? null));
  const [leadRoom, ...others] = cards;
  const stacked = others.slice(0, 2);
  const row = others.slice(2);
  const largestGroup = Math.max(1, ...offered.map((item) => item.sleeps));
  const today = inventoryService().today();
  const evenings = home.evenings;
  const [eveningPhoto, eveningDetail] = evenings?.photos ?? [];
  const nearby = location.nearby.places.slice(0, 3);

  return (
    <main id="main" className="flex-1">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(lodgingBusinessData(content, env.siteUrl())) }} />

      <section
        data-hero
        aria-labelledby="hero-title"
        className="on-dark relative isolate overflow-hidden bg-midnight-navy text-fg min-[56.25rem]:h-[min(92svh,53.75rem)] min-[56.25rem]:min-h-[37.5rem]"
      >
        <HeroPhoto image={home.hero.photo} />
        <div className="site-wrap relative flex h-full flex-col justify-end pt-44 pb-30 min-[56.25rem]:pt-32 min-[56.25rem]:pb-34">
          <p className="hero-rise mb-6 flex items-center gap-3.5 font-display text-nav tracking-[0.04em] text-romaic-gold before:h-px before:w-12 before:shrink-0 before:bg-romaic-gold before:content-['']">
            {facts.addressLine}
          </p>
          <h1 id="hero-title" className={cx(siteText.hero, "hero-rise max-w-[11.5ch]")} style={riseDelay(0.15)}>
            {home.hero.headline}
          </h1>
          <p className="hero-rise mt-6 max-w-[30em] text-lede text-[#d9dde3]" style={riseDelay(0.3)}>
            {home.hero.lead}
          </p>
        </div>
      </section>

      {/* The availability bar overlaps the photograph's foot. The phone dock waits until it has scrolled away. */}
      <div id={dockAfterId} className="relative z-20 -mt-16">
        <div className="site-wrap">
          <DatesSearch layout="bar" action={sitePagePaths.book} today={today} maxGuests={largestGroup} submitLabel="Check availability" label="Check availability" />
          <OrMessageUs facts={facts} className="mt-4 text-[0.9375rem] text-fg-2" />
        </div>
      </div>

      <section aria-labelledby="house-title" className="py-band">
        <div
          className={cx(
            "site-wrap grid items-center gap-x-[clamp(2.5rem,6vw,6rem)] gap-y-14",
            home.highlights.photo && "min-[56.25rem]:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]",
          )}
        >
          <div>
            <h2 id="house-title" className={cx(siteText.section, "max-w-[12ch]")}>
              {home.highlights.heading}
            </h2>
            {home.highlights.intro && (
              <div className="mt-7">
                <Paragraphs text={home.highlights.intro} className={siteText.lede} />
              </div>
            )}
            <ul className="mt-10 grid gap-x-10 min-[35rem]:grid-cols-2">
              {home.highlights.items.map((item) => (
                <li key={item.title} className="border-t border-hairline py-4.5">
                  <h3 className="mb-1 font-display text-lg leading-snug tracking-[0.01em] text-ink">{item.title}</h3>
                  {item.lines.map((line) => (
                    <p key={line} className="text-[0.9375rem] leading-normal text-fg-2">
                      {line}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
            <p className="mt-8">
              <Link href={sitePagePaths.facilities} className={siteText.link}>
                See all our facilities
              </Link>
            </p>
          </div>
          {home.highlights.photo && <FramedPhoto image={home.highlights.photo} aspect="4/5" sizes="(min-width: 900px) 34rem, calc(100vw - 4rem)" />}
        </div>
      </section>

      <section aria-labelledby="rooms-title" className="bg-cream py-band">
        <div className="site-wrap">
          <div className="mb-14 grid items-end gap-x-16 gap-y-6 min-[56.25rem]:grid-cols-2">
            <h2 id="rooms-title" className={siteText.section}>
              {home.apartments.heading}
            </h2>
            {home.apartments.intro && (
              <div className="min-[56.25rem]:justify-self-end">
                <Paragraphs text={home.apartments.intro} className={siteText.lede} />
              </div>
            )}
          </div>
          {leadRoom && (
            <div className={cx("grid gap-8", stacked.length > 0 && "min-[56.25rem]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]")}>
              <ApartmentCard apartment={leadRoom} layout="lead" />
              {stacked.length > 0 && (
                <div className={cx("grid gap-8", stacked.length === 2 && "min-[56.25rem]:grid-rows-2")}>
                  {stacked.map((apartment) => (
                    <ApartmentCard key={apartment.href} apartment={apartment} layout="stacked" />
                  ))}
                </div>
              )}
            </div>
          )}
          {row.length > 0 && (
            <div className="mt-14 grid gap-x-8 gap-y-12 border-t border-hairline pt-12 min-[35rem]:grid-cols-2 min-[67.5rem]:grid-cols-4">
              {row.map((apartment) => (
                <ApartmentCard key={apartment.href} apartment={apartment} layout="compact" />
              ))}
            </div>
          )}
          <div className="mt-12 flex flex-wrap items-center justify-between gap-x-8 gap-y-5">
            <Link href={sitePagePaths.apartments} className={siteText.link}>
              Compare the rooms
            </Link>
            <Link href={sitePagePaths.book} className={buttonClasses({ variant: "primary", size: "lg" })}>
              Check availability
            </Link>
          </div>
        </div>
      </section>

      {evenings && (
        <section aria-labelledby="evenings-title" className="on-dark overflow-hidden bg-midnight-navy py-band text-fg">
          <div
            className={cx(
              "site-wrap grid items-center gap-x-[clamp(2.5rem,6vw,6rem)] gap-y-16",
              eveningPhoto && "min-[56.25rem]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]",
            )}
          >
            <div>
              <h2 id="evenings-title" className={cx(siteText.section, "max-w-[12ch]")}>
                {evenings.heading}
              </h2>
              {evenings.intro && (
                <div className="mt-7">
                  <Paragraphs text={evenings.intro} className={siteText.lede} />
                </div>
              )}
              <dl className="mt-9 grid">
                <TimeRow label="Check-in" value={`${policies.checkIn.from} to ${policies.checkIn.until}`} window={policies.checkIn} />
                <TimeRow label="Check-out" value={`By ${policies.checkOut.until}`} window={policies.checkOut} />
              </dl>
              <p className="mt-8">
                <Link href={sitePagePaths.policies} className={siteText.link}>
                  Read the house rules
                </Link>
              </p>
            </div>
            {eveningPhoto && (
              <div
                className={cx(
                  "relative after:pointer-events-none after:absolute after:-top-5.5 after:right-0 after:h-[60%] after:w-[55%] after:border-t after:border-r after:border-romaic-gold after:content-[''] min-[35rem]:after:-right-5.5",
                  eveningDetail && "pb-18",
                )}
              >
                <ContentPhoto image={eveningPhoto} aspect="4/3" sizes="(min-width: 900px) 44rem, calc(100vw - 2.5rem)" />
                {eveningDetail && (
                  <div className="absolute bottom-0 left-0 w-[48%] border-10 border-midnight-navy min-[35rem]:w-[42%] min-[56.25rem]:-left-14">
                    <ContentPhoto image={eveningDetail} aspect="1/1" sizes="(min-width: 900px) 19rem, 45vw" />
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      <section aria-labelledby="visit-title" className="py-band">
        <div className="site-wrap">
          <h2 id="visit-title">
            <a
              href={facts.mapLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block font-display text-display-address font-light tracking-[-0.02em] text-balance text-ink transition-colors duration-200 hover:text-gold-text"
            >
              {site.address.street},<br />
              {facts.areaLine}
              <VisuallyHidden> (map, {newTabHint})</VisuallyHidden>
            </a>
          </h2>
          <div className="mt-14 grid gap-x-8 gap-y-10 min-[35rem]:grid-cols-2 min-[67.5rem]:grid-cols-4">
            <VisitBlock title={home.location.heading}>{home.location.text && <Paragraphs text={home.location.text} />}</VisitBlock>
            {nearby.length > 0 && (
              <VisitBlock title={location.nearby.heading}>
                <ul className="grid gap-1">
                  {nearby.map((place) => (
                    <li key={place.name}>
                      {place.name}
                      {place.distance && <span data-numeric> · {place.distance}</span>}
                      {!place.confirmed && (
                        <>
                          {" "}
                          <ToConfirm />
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                <p>
                  <Link href={sitePagePaths.location} className={siteText.link}>
                    What&rsquo;s nearby
                  </Link>
                </p>
              </VisitBlock>
            )}
            {location.directions && (
              <VisitBlock title="Getting here">
                <Paragraphs text={location.directions} />
              </VisitBlock>
            )}
            <VisitBlock title={contactPage.heading}>
              <p>
                <a href={facts.whatsapp} target="_blank" rel="noopener noreferrer" className={siteText.link}>
                  WhatsApp
                  <VisuallyHidden>{whatsappHint}</VisuallyHidden>
                </a>{" "}
                or call{" "}
                <a href={facts.phone.tel} className={cx(siteText.link, "whitespace-nowrap")} data-numeric>
                  {facts.phone.display}
                </a>
              </p>
              <p>
                <a href={`mailto:${facts.email}`} className="break-all underline-offset-4 hover:text-ink hover:underline">
                  {facts.email}
                </a>
              </p>
            </VisitBlock>
          </div>
        </div>
      </section>

      <section aria-labelledby="closing-title" className="bg-cream py-band-sm">
        <div className="site-wrap grid items-end gap-x-16 gap-y-8 min-[56.25rem]:grid-cols-2">
          <h2 id="closing-title" className={siteText.section}>
            {home.hero.welcome || book.heading}
          </h2>
          <div className="grid justify-items-start gap-6 min-[56.25rem]:justify-self-end">
            {book.intro && <Paragraphs text={book.intro} className={siteText.lede} />}
            <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
              <Link href={sitePagePaths.book} className={buttonClasses({ variant: "primary", size: "lg" })}>
                Check availability
              </Link>
              <OrMessageUs facts={facts} className="text-[0.9375rem] text-fg-2" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
