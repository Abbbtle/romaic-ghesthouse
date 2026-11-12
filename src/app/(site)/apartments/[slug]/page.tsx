import { Accessibility, ArrowLeft, Bath, BedDouble, Check, Eye, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AvailabilityCalendar } from "@/components/site/availability-calendar";
import { ContentPhoto } from "@/components/site/content-photo";
import { DatesSearch } from "@/components/site/dates-search";
import { GoldBarHeading } from "@/components/site/gold-bar-heading";
import { PageBand } from "@/components/site/page-heading";
import { siteFactsOf, whatsappWith } from "@/components/site/site-facts";
import { dockAfterId } from "@/components/site/site-dock";
import { ToConfirm } from "@/components/site/to-confirm";
import { buttonClasses } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { Paragraphs } from "@/components/ui/paragraphs";
import { textStyles } from "@/components/ui/typography";
import { VisuallyHidden, whatsappHint } from "@/components/ui/visually-hidden";
import { apartmentPath, sitePagePaths } from "@/lib/content/pages";
import type { Apartment } from "@/lib/content/schema";
import { inventoryService } from "@/server/stays";
import { getSiteContent } from "@/server/site-content";

/** Read per request with the content as it is now, like every public page (see ../layout.tsx), so it may wait for it. */
export const instant = false;

/** How many nights ahead the calendar shows: about two months. */
const calendarNights = 61;

async function publishedApartment(slug: string): Promise<Apartment | null> {
  const { apartments } = await getSiteContent();
  return apartments.items.find((item) => item.slug === slug && item.published) ?? null;
}

export async function generateMetadata({ params }: PageProps<"/apartments/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const apartment = await publishedApartment(slug);
  if (!apartment) return {};
  const { site } = await getSiteContent();
  const title = `${apartment.name} – ${site.businessName}`;
  return {
    title: { absolute: title },
    description: apartment.summary,
    alternates: { canonical: apartmentPath(apartment.slug) },
    openGraph: { title, description: apartment.summary, url: apartmentPath(apartment.slug) },
  };
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[1.5rem_1fr] gap-3">
      <span className="mt-0.5 text-gold-text">{icon}</span>
      <div>
        <dt className="text-sm font-bold text-fg-3">{label}</dt>
        <dd className="text-base text-ink">{children}</dd>
      </div>
    </div>
  );
}

/**
 * One apartment: its photos in gold frames, who it sleeps, its beds,
 * bathroom and view, what's in it, how accessible it is in exact words,
 * which nights are free over the next two months, and a dates search that
 * asks about this apartment. Details the owner hasn't confirmed are marked
 * "To confirm".
 */
export default async function ApartmentPage({ params }: PageProps<"/apartments/[slug]">) {
  const { slug } = await params;
  const apartment = await publishedApartment(slug);
  if (!apartment) notFound();
  const content = await getSiteContent();
  const facts = siteFactsOf(content);
  const inventory = inventoryService();
  const today = inventory.today();
  const nights = await inventory.calendar(apartment.slug, today, calendarNights);
  const setUp = nights.some((night) => night.status !== "not-set-up");
  const [lead, ...more] = apartment.photos;
  const icon = "size-5";

  return (
    <main id="main" className="flex-1">
      <PageBand tone="cream" className="grid gap-8 lg:grid-cols-12 lg:items-start lg:gap-12">
        <div className="grid gap-3 lg:order-last lg:col-span-7">
          {lead ? (
            <ContentPhoto image={lead} preload sizes="(min-width: 1024px) 40rem, calc(100vw - 2rem)" />
          ) : (
            <div data-placeholder="photo" className="photo-frame flex aspect-4/3 items-center justify-center bg-neutral-100 text-sm text-fg-3">
              Photo to come
            </div>
          )}
          {more.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {more.map((photo) => (
                <li key={photo.src}>
                  <ContentPhoto image={photo} sizes="(min-width: 1024px) 13rem, 45vw" />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid content-start gap-6 lg:col-span-5">
          <p className="text-sm">
            <Link href={sitePagePaths.apartments} className="inline-flex min-h-11 items-center gap-1.5 font-bold text-link underline underline-offset-4 hover:text-link-hover">
              <ArrowLeft aria-hidden="true" strokeWidth={1.75} className="size-4" />
              All apartments
            </Link>
          </p>
          <GoldBarHeading as="h1" size="hero" sweep>
            {apartment.name}
          </GoldBarHeading>
          {!apartment.confirmed && <ToConfirm className="justify-self-start" />}
          <p className={textStyles.lead}>{apartment.summary}</p>
          <dl className="grid gap-4 border-y border-romaic-gold/60 py-5">
            <Fact icon={<Users aria-hidden="true" strokeWidth={1.5} className={icon} />} label="Sleeps">
              Up to {apartment.sleeps} {apartment.sleeps === 1 ? "guest" : "guests"}
            </Fact>
            <Fact icon={<BedDouble aria-hidden="true" strokeWidth={1.5} className={icon} />} label="Beds">
              {apartment.beds}
            </Fact>
            <Fact icon={<Bath aria-hidden="true" strokeWidth={1.5} className={icon} />} label="Bathroom">
              {apartment.bathroom}
            </Fact>
            {apartment.view && (
              <Fact icon={<Eye aria-hidden="true" strokeWidth={1.5} className={icon} />} label="View">
                {apartment.view}
              </Fact>
            )}
          </dl>
          <p data-placeholder="price" className="text-base text-fg-2">
            <strong className="text-ink">Price on request.</strong> Send a request with your dates and we&rsquo;ll reply with the price.
          </p>
          {/* From 1024 px the dates panel sits lower, beside the details: this brings it into reach from the first screen. */}
          <a href="#ask-title" className={buttonClasses({ variant: "primary", size: "lg" }, "hidden justify-self-start lg:inline-flex")}>
            Check dates for this apartment
          </a>
        </div>
      </PageBand>

      <PageBand className="grid gap-12 lg:grid-cols-12 lg:gap-12">
        <div className="grid content-start gap-10 lg:col-span-7">
          {apartment.description && (
            <section aria-labelledby="about-title" className="grid gap-4">
              <h2 id="about-title" className={textStyles.h2}>
                About this apartment
              </h2>
              <Paragraphs text={apartment.description} className={textStyles.body} />
            </section>
          )}
          {apartment.features.length > 0 && (
            <section aria-labelledby="features-title" className="grid gap-4">
              <h2 id="features-title" className={textStyles.h2}>
                In the apartment
              </h2>
              <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {apartment.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-base">
                    <Check aria-hidden="true" strokeWidth={1.75} className="mt-0.5 size-5 shrink-0 text-gold-text" />
                    {feature}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {apartment.accessibility && (
            <section aria-labelledby="access-title" className="grid gap-4 border-l-4 border-romaic-gold bg-white p-5">
              <h2 id="access-title" className="flex items-center gap-3 text-h3 font-bold text-ink">
                <Accessibility aria-hidden="true" strokeWidth={1.5} className="size-6 text-gold-text" />
                Accessibility
              </h2>
              <Paragraphs text={apartment.accessibility} className={textStyles.body} />
            </section>
          )}
          <section id="free-nights" aria-labelledby="calendar-title" className="grid scroll-mt-6 gap-4">
            <h2 id="calendar-title" className={textStyles.h2}>
              Free nights
            </h2>
            {setUp ? (
              <>
                <p className={textStyles.secondary}>The next two months. A booked night is taken in every apartment of this kind.</p>
                <AvailabilityCalendar nights={nights} />
              </>
            ) : (
              <p className={textStyles.body}>
                We don&rsquo;t show this apartment&rsquo;s calendar online yet. Send a request with your dates, or{" "}
                <a
                  href={whatsappWith(facts, `Hi, is the ${apartment.name} free on my dates?`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-link underline underline-offset-4 hover:text-link-hover"
                >
                  WhatsApp us
                  <VisuallyHidden>{whatsappHint}</VisuallyHidden>
                </a>
                , and we&rsquo;ll check for you.
              </p>
            )}
          </section>
        </div>
        {/* On phones the dates come straight after the price line, before the details; from 1024 px they sit beside them. */}
        <aside aria-labelledby="ask-title" className="order-first grid content-start gap-4 lg:sticky lg:top-6 lg:order-none lg:col-span-5">
          <h2 id="ask-title" className={cx(textStyles.h3, "scroll-mt-6")}>
            Ask about your dates
          </h2>
          <div id={dockAfterId}>
            <DatesSearch
              action={sitePagePaths.book}
              apartment={apartment.slug}
              today={today}
              maxGuests={apartment.sleeps}
              initialGuests={Math.min(2, apartment.sleeps)}
              submitLabel="Check this apartment"
              label={`Check dates for the ${apartment.name}`}
            />
          </div>
        </aside>
      </PageBand>
    </main>
  );
}
