import { BedDouble, CalendarCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ContentPhoto } from "@/components/site/content-photo";
import { DatesSearch } from "@/components/site/dates-search";
import { PageBand, PageHeading } from "@/components/site/page-heading";
import { RequestForm } from "@/components/site/request-form";
import { siteFactsOf, whatsappWith } from "@/components/site/site-facts";
import { dockAfterId } from "@/components/site/site-dock";
import { ToConfirm } from "@/components/site/to-confirm";
import { buttonClasses } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { Notice } from "@/components/ui/notice";
import { Paragraphs } from "@/components/ui/paragraphs";
import { textStyles } from "@/components/ui/typography";
import { VisuallyHidden, whatsappHint } from "@/components/ui/visually-hidden";
import { apartmentPath, sitePagePaths } from "@/lib/content/pages";
import type { Apartment } from "@/lib/content/schema";
import type { ApartmentStatus, PublicApartmentAvailability } from "@/lib/inventory/availability";
import { formatDayShort } from "@/lib/format/date-time";
import { formatCents } from "@/lib/format/money";
import { addDays } from "@/lib/format/zoned-time";
import type { StaySearch } from "@/lib/inventory/inventory-service";
import { nightsLabel, stayLabel } from "@/lib/inventory/stays";
import type { Quote } from "@/lib/rates/rates";
import { bookingService, inventoryService } from "@/server/stays";
import { publicQuote } from "@/server/rates";
import { getSiteContent } from "@/server/site-content";
import { pageMetadata } from "../page-metadata";
import { sendBookingRequest } from "./actions";

/** Read per request with the content as it is now, like every public page (see ../layout.tsx), so it may wait for it. */
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("book");
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The Book page's address for a search, optionally with an apartment chosen. */
function bookHref(search: StaySearch, apartment?: string): string {
  const query = new URLSearchParams({ arrive: search.arrive, leave: search.leave, guests: String(search.guests) });
  if (apartment) query.set("apartment", apartment);
  return `${sitePagePaths.book}?${query.toString()}`;
}

/**
 * Each availability state reads differently, never by colour alone: free in
 * the success tag; unknown (no units set up) as a plain sentence; booked as
 * a line pointing to the free nights, on a card that's dimmed.
 */
function Availability({ status, slug }: { status: ApartmentStatus; slug: string }) {
  if (status === "free") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-xs bg-success-50 px-2 py-1 text-sm font-bold text-success-800">
        <CalendarCheck aria-hidden="true" strokeWidth={2} className="size-4" />
        Free for your dates
      </span>
    );
  }
  if (status === "not-set-up") return <p className="text-sm text-fg-2">We&rsquo;ll check it&rsquo;s free and confirm when we reply.</p>;
  return (
    <p className="text-sm font-bold text-fg-2">
      Booked for these dates ·{" "}
      <Link href={`${apartmentPath(slug)}#free-nights`} className="text-link underline underline-offset-4 hover:text-link-hover">
        See its free nights
      </Link>
    </p>
  );
}

/** Whether an apartment can be asked for: not booked, and the stay is at least its shortest (no rate means no minimum). */
function requestable(result: PublicApartmentAvailability, quote: Quote | null): boolean {
  return result.status !== "full" && (quote?.meetsMinimum ?? true);
}

/**
 * The stay's price from the rates ("R2,400 for 3 nights"). Nothing without
 * a rate (the owner prices those in the reply, as before), and nothing when
 * the stay is too short (TooShort says so instead).
 */
function StayPrice({ quote, search }: { quote: Quote | null; search: StaySearch }) {
  if (!quote || !quote.meetsMinimum) return null;
  return (
    <p className="text-base text-fg-2" data-numeric>
      <strong className="text-lead font-bold text-ink">{formatCents(quote.totalCents)}</strong> for {nightsLabel(search)}
    </p>
  );
}

/**
 * Free, but the stay is shorter than the shortest these dates allow: said
 * plainly (not as "free"), with a search for the same arrival and enough
 * nights. That search checks again whether those nights are free.
 */
function TooShort({ minNights, search }: { minNights: number; search: StaySearch }) {
  const longer = { ...search, leave: addDays(search.arrive, minNights) };
  return (
    <p className="text-base text-fg-2">
      <strong className="font-bold text-ink">Needs at least {minNights} nights</strong> for these dates ·{" "}
      <Link href={bookHref(longer)} className="font-bold text-link underline underline-offset-4 hover:text-link-hover">
        Try {formatDayShort(longer.arrive)} to {formatDayShort(longer.leave)} instead
      </Link>
    </p>
  );
}

/** `lead`: the first apartment that can be requested, the one primary button on the page; the rest are secondary. */
function ResultCard({
  apartment,
  result,
  quote,
  search,
  lead,
}: {
  apartment: Apartment;
  result: PublicApartmentAvailability;
  quote: Quote | null;
  search: StaySearch;
  lead: boolean;
}) {
  const photo = apartment.photos[0];
  const bookable = result.status !== "full";
  return (
    <li className="grid gap-4 border border-hairline bg-white p-4 sm:grid-cols-[14rem_1fr] sm:gap-6 sm:p-5">
      <div className={bookable ? undefined : "opacity-70"}>
        {photo ? (
          <ContentPhoto image={photo} sizes="(min-width: 640px) 14rem, calc(100vw - 4rem)" />
        ) : (
          <div data-placeholder="photo" className="photo-frame flex aspect-4/3 items-center justify-center bg-neutral-100 text-sm text-fg-3">
            Photo to come
          </div>
        )}
      </div>
      <div className="grid content-start gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h3 className={cx(textStyles.h3, !bookable && "text-fg-2")}>{apartment.name}</h3>
          {!apartment.confirmed && <ToConfirm />}
        </div>
        <p className="flex flex-wrap gap-x-5 gap-y-1 text-base text-fg-2">
          <span className="inline-flex items-center gap-1.5">
            <Users aria-hidden="true" strokeWidth={1.5} className="size-4 text-gold-text" />
            Sleeps up to {apartment.sleeps}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <BedDouble aria-hidden="true" strokeWidth={1.5} className="size-4 text-gold-text" />
            {apartment.beds}
          </span>
        </p>
        <p className="text-base text-fg-2">{apartment.summary}</p>
        {bookable && quote && !quote.meetsMinimum ? (
          <TooShort minNights={quote.minNights} search={search} />
        ) : (
          <>
            <Availability status={result.status} slug={apartment.slug} />
            {bookable && <StayPrice quote={quote} search={search} />}
          </>
        )}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
          {requestable(result, quote) && (
            <Link href={`${bookHref(search, apartment.slug)}#request`} className={buttonClasses({ variant: lead ? "primary" : "secondary" })}>
              Request this apartment
              <VisuallyHidden>: {apartment.name}</VisuallyHidden>
            </Link>
          )}
          <Link href={apartmentPath(apartment.slug)} className="inline-flex min-h-11 items-center font-bold text-link underline underline-offset-4 hover:text-link-hover">
            See the apartment
            <VisuallyHidden>: {apartment.name}</VisuallyHidden>
          </Link>
        </div>
      </div>
    </li>
  );
}

/**
 * The Book page: dates and guests, then the apartments that fit and whether
 * each is free (live, from the inventory), then a booking request for the
 * one chosen. The search lives in the address (arrive, leave, guests,
 * apartment), so it works without scripts and can be shared; the server
 * checks it, and checks availability again when the request is sent.
 */
export default async function BookPage({ searchParams }: PageProps<"/book">) {
  const params = await searchParams;
  const content = await getSiteContent();
  const { book, apartments } = content;
  const facts = siteFactsOf(content);
  const inventory = inventoryService();
  const today = inventory.today();
  const offered = apartments.items.filter((item) => item.published);
  const largestGroup = Math.max(1, ...offered.map((item) => item.sleeps));
  const asked = { arrive: one(params.arrive), leave: one(params.leave), guests: one(params.guests) };
  const chosenSlug = one(params.apartment);
  const searched = asked.arrive !== undefined || asked.leave !== undefined;
  const checked = searched ? inventory.checkSearch(asked) : null;
  const search = checked?.ok ? checked.value : null;
  const problem = checked && !checked.ok ? Object.values(checked.errors)[0] : undefined;

  const searchForm = (
    <DatesSearch
      action={sitePagePaths.book}
      today={today}
      maxGuests={largestGroup}
      apartment={chosenSlug}
      initialArrive={asked.arrive ?? ""}
      initialLeave={asked.leave ?? ""}
      initialGuests={Number(asked.guests) || 2}
      initialProblem={problem}
      submitLabel={search ? "Search again" : "Show free apartments"}
    />
  );

  if (!search) {
    return (
      <main id="main" className="flex-1">
        <PageBand tone="cream" className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <PageHeading title={book.heading} intro={book.intro} />
          </div>
          <div className="lg:col-span-6">{searchForm}</div>
        </PageBand>
      </main>
    );
  }

  const results = await inventory.search(search);
  const bySlug = new Map(offered.map((item) => [item.slug, item]));
  const fitting = results.filter((result) => result.fits && bySlug.has(result.slug));
  const tooSmall = results.filter((result) => !result.fits && bySlug.has(result.slug));
  const chosen = chosenSlug ? await inventory.requestability(chosenSlug, search) : null;
  const chosenApartment = chosen?.ok ? bySlug.get(chosen.apartment.slug) : undefined;
  // Prices for the apartments shown (null where there's no rate); the chosen one's is an estimate the owner confirms.
  const quotes = new Map(await Promise.all(fitting.map(async (result) => [result.slug, await publicQuote(result.slug, search, search.guests)] as const)));
  const chosenQuote = chosenApartment ? (quotes.get(chosenApartment.slug) ?? (await publicQuote(chosenApartment.slug, search, search.guests))) : null;
  const lead = fitting.find((result) => requestable(result, quotes.get(result.slug) ?? null))?.slug;
  const summary = `${stayLabel(search)}, ${search.guests} ${search.guests === 1 ? "guest" : "guests"}`;

  const requesting = Boolean(chosen?.ok && chosenApartment);

  return (
    <main id="main" className="flex-1">
      <PageBand tone="cream" className="grid gap-6">
        <PageHeading title={book.heading}>
          {/* While requesting, the stay is summarised beside the form instead, once. */}
          {!requesting && (
            <p className="text-lead font-bold text-ink" data-numeric>
              {summary}
            </p>
          )}
        </PageHeading>
        {!requesting && (
          <details className="group max-w-md">
            <summary className="inline-flex min-h-11 cursor-pointer items-center font-bold text-link underline underline-offset-4 hover:text-link-hover">
              Change dates or guests
            </summary>
            <div className="pt-4">{searchForm}</div>
          </details>
        )}
      </PageBand>

      {chosen?.ok && chosenApartment ? (
        <PageBand className="grid gap-10 lg:grid-cols-12">
          {/* The dock waits until this whole section has scrolled past, so it never covers the form being filled in. */}
          <div id={dockAfterId} className="lg:col-span-7">
          <section id="request" aria-labelledby="request-title" className="grid content-start gap-6">
            <div className="grid gap-3">
              <h2 id="request-title" className={textStyles.h2}>
                Request the {chosenApartment.name}
              </h2>
              {book.requestNote && <Paragraphs text={book.requestNote} className={textStyles.body} />}
              {chosen.status === "not-set-up" && (
                <Notice tone="info">We&rsquo;ll check this apartment is free for your dates and confirm when we reply.</Notice>
              )}
            </div>
            {chosenQuote && !chosenQuote.meetsMinimum ? (
              <Notice tone="warning" title={`The shortest stay here is ${chosenQuote.minNights} nights`}>
                For these dates, the {chosenApartment.name} needs at least {chosenQuote.minNights} nights. Change your dates, or choose another apartment.
              </Notice>
            ) : (
              <RequestForm
                action={sendBookingRequest}
                formToken={bookingService().form.issueToken()}
                apartment={chosenApartment.slug}
                arrive={search.arrive}
                leave={search.leave}
                guests={search.guests}
                sleeps={chosenApartment.sleeps}
                consentLabel={book.consent.label}
                privacyHref={sitePagePaths.privacy}
                backHref={bookHref(search)}
              />
            )}
          </section>
          </div>
          {/* What's being asked for comes first on phones, so nobody fills in a form for an apartment they can't see. */}
          <aside aria-label="Your stay" className="order-first grid content-start gap-4 lg:order-none lg:col-span-5">
            <div className="grid grid-cols-[6rem_1fr] items-start gap-4 border-t-4 border-romaic-gold bg-white p-4 lg:grid-cols-1 lg:p-5">
              {chosenApartment.photos[0] ? (
                <ContentPhoto image={chosenApartment.photos[0]} sizes="(min-width: 1024px) 24rem, 6rem" />
              ) : (
                <span aria-hidden="true" />
              )}
              <div className="grid gap-1">
                <p className="text-h4 font-bold text-ink">{chosenApartment.name}</p>
                <p className="text-base text-fg-2" data-numeric>
                  {summary}
                </p>
                {chosenQuote?.meetsMinimum ? (
                  <p className="text-sm text-fg-2" data-numeric>
                    Estimated <strong className="font-bold text-ink">{formatCents(chosenQuote.totalCents)}</strong> for {nightsLabel(search)}: we&rsquo;ll confirm
                    the price when we reply.
                  </p>
                ) : chosenQuote ? null : (
                  <p data-placeholder="price" className="text-sm text-fg-3">
                    Price on request: we&rsquo;ll include it in our reply.
                  </p>
                )}
                <p className="mt-1">
                  <Link href={bookHref(search)} className="inline-flex min-h-11 items-center font-bold text-link underline underline-offset-4 hover:text-link-hover">
                    Choose another apartment
                  </Link>
                </p>
              </div>
            </div>
            <details className="max-w-md">
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-bold text-link underline underline-offset-4 hover:text-link-hover">
                Change dates or guests
              </summary>
              <div className="pt-4">{searchForm}</div>
            </details>
          </aside>
        </PageBand>
      ) : (
        <PageBand className="grid gap-8">
          {chosenSlug && chosen && !chosen.ok && (
            <Notice tone="warning" title={chosen.reason === "full" ? "That apartment is booked for these dates" : "That apartment can't be requested for this search"}>
              {chosen.reason === "too-small" ? "It doesn't sleep this many guests. " : ""}Choose one of the apartments below, or other dates.
            </Notice>
          )}
          <section aria-labelledby="results-title" className="grid gap-5">
            <h2 id="results-title" className={textStyles.h2}>
              {fitting.some((result) => result.status !== "full") ? "Apartments for your stay" : "Nothing free for these dates"}
            </h2>
            {fitting.length > 0 ? (
              <ul className="grid gap-5">
                {fitting.map((result) => (
                  <ResultCard
                    key={result.slug}
                    apartment={bySlug.get(result.slug)!}
                    result={result}
                    quote={quotes.get(result.slug) ?? null}
                    search={search}
                    lead={result.slug === lead}
                  />
                ))}
              </ul>
            ) : (
              <p className={textStyles.body}>None of our apartments sleeps {search.guests} guests on its own. WhatsApp or call us and we&rsquo;ll find a way.</p>
            )}
            {fitting.length > 0 && fitting.every((result) => result.status === "full") && (
              <p className={textStyles.body}>Try other dates, or WhatsApp us: we may be able to help.</p>
            )}
          </section>
          {tooSmall.length > 0 && (
            <details className="border-t border-hairline pt-4">
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-bold text-ink">
                Smaller apartments (sleep up to {Math.max(...tooSmall.map((result) => bySlug.get(result.slug)!.sleeps))})
              </summary>
              <ul className="mt-3 grid gap-2 text-base text-fg-2">
                {tooSmall.map((result) => {
                  const apartment = bySlug.get(result.slug)!;
                  return (
                    <li key={result.slug}>
                      <Link href={apartmentPath(apartment.slug)} className="font-bold text-link underline underline-offset-4 hover:text-link-hover">
                        {apartment.name}
                      </Link>{" "}
                      sleeps up to {apartment.sleeps}
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
          <p className="text-sm text-fg-2">
            Questions first?{" "}
            <a
              href={whatsappWith(facts, `Hi, I'm looking at ${summary}.`)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-link underline underline-offset-4 hover:text-link-hover"
            >
              WhatsApp us
              <VisuallyHidden>{whatsappHint}</VisuallyHidden>
            </a>{" "}
            or call{" "}
            <a href={facts.phone.tel} className="font-bold whitespace-nowrap text-link underline underline-offset-4 hover:text-link-hover" data-numeric>
              {facts.phone.display}
            </a>
            .
          </p>
        </PageBand>
      )}
    </main>
  );
}
