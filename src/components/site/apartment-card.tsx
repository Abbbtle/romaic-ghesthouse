import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { cx } from "@/components/ui/cx";
import type { ImageRef } from "@/lib/content/schema";
import { ContentPhoto } from "./content-photo";
import { siteText } from "./site-type";
import { ToConfirm } from "./to-confirm";

export type ApartmentSummary = {
  name: string;
  href: string;
  /** The room's one sentence for its card. */
  summary: string;
  sleeps: number;
  beds: string;
  /** The first photo; null shows a block that says a photo is to come. */
  photo: ImageRef | null;
  /** The owner has checked these details; otherwise they're marked "To confirm". */
  confirmed?: boolean;
  /** Short facts, each a few words: "Kitchenette", "Private bathroom". */
  features: readonly { label: string; icon: "kitchen" | "bath" | "wifi" }[];
  /** The room's rate, already worded ("From R850 a night"), or null while there's none. */
  price: string | null;
};

/**
 * How a card sits (the approved design's room cards):
 * - lead: the first room on the home page, a large photo over its name and sentence;
 * - stacked: the two beside it, photo and words side by side from 560 px;
 * - compact: the row of the rest, four across on a laptop;
 * - standard: a card on the Rooms page, with who it sleeps, its beds and its facts;
 * - feature: the Rooms page's first card when the count is odd, photo and words side by side.
 */
export type RoomCardLayout = "lead" | "stacked" | "compact" | "standard" | "feature";

const zoom = "transition-transform duration-700 ease-[cubic-bezier(0.2,0.7,0.2,1)] motion-safe:group-hover:scale-[1.035]";

function Price({ price }: { price: string | null }) {
  return price ? (
    <span className="font-display text-[1.0625rem] leading-tight whitespace-nowrap text-ink" data-numeric>
      {price}
    </span>
  ) : (
    <span data-placeholder="price" className="font-display text-[1.0625rem] leading-tight whitespace-nowrap text-ink">
      Price on request
    </span>
  );
}

function CardPhoto({ photo, layout }: { photo: ImageRef | null; layout: RoomCardLayout }) {
  const sizes = {
    lead: "(min-width: 900px) 46rem, calc(100vw - 2.5rem)",
    stacked: "(min-width: 900px) 16rem, (min-width: 560px) 45vw, calc(100vw - 2.5rem)",
    compact: "(min-width: 1080px) 18rem, (min-width: 560px) 45vw, calc(100vw - 2.5rem)",
    standard: "(min-width: 900px) 38rem, calc(100vw - 2.5rem)",
    feature: "(min-width: 900px) 46rem, calc(100vw - 2.5rem)",
  }[layout];
  // Stacked cards fill the height of their row from 560 px; every other card is 4:3.
  const fill = layout === "stacked";
  if (!photo) {
    return (
      <div
        data-placeholder="photo"
        className={cx(
          "flex items-center justify-center bg-navy-850 text-sm text-on-navy-2",
          fill ? "aspect-4/3 min-[35rem]:aspect-auto min-[35rem]:h-full min-[35rem]:min-h-56" : "aspect-4/3",
        )}
      >
        Photo to come
      </div>
    );
  }
  return (
    <ContentPhoto
      image={photo}
      sizes={sizes}
      aspect={fill ? "free" : "4/3"}
      className={fill ? "aspect-4/3 min-[35rem]:aspect-auto min-[35rem]:h-full min-[35rem]:min-h-56" : undefined}
      imageClassName={zoom}
    />
  );
}

/**
 * One room: its photo, its name (the link to its page, stretched over the
 * whole card), and a line of detail over a hairline with the nightly price
 * from the rates ("From R850 a night") or "Price on request". Every card
 * has the same parts in the same places, so rooms compare at a glance; a
 * room whose details the owner hasn't confirmed says so quietly. Focus
 * rings the whole card in gold.
 */
export function ApartmentCard({ apartment, layout = "standard", className }: { apartment: ApartmentSummary; layout?: RoomCardLayout; className?: string }) {
  const unconfirmed = apartment.confirmed === false;
  const title = layout === "lead" || layout === "feature" ? siteText.titleLarge : layout === "compact" ? siteText.titleSm : siteText.title;
  const name = (
    <h3 className={title}>
      <Link href={apartment.href} className="transition-colors duration-200 group-hover:text-gold-text focus-visible:outline-none after:absolute after:inset-0">
        {apartment.name}
      </Link>
    </h3>
  );
  const sleeps = `Sleeps up to ${apartment.sleeps}`;
  const ringed = "has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-4 has-[a:focus-visible]:outline-focus";

  if (layout === "stacked") {
    return (
      <article className={cx("group relative grid gap-4 min-[35rem]:grid-cols-2 min-[35rem]:gap-6", ringed, className)}>
        <div className="overflow-hidden min-[35rem]:h-full">
          <CardPhoto photo={apartment.photo} layout={layout} />
        </div>
        <div className="grid content-between gap-4 py-1">
          {name}
          <div className="grid gap-2 border-t border-hairline pt-3.5 text-[0.9375rem] leading-normal text-fg-2">
            <p>{apartment.summary}</p>
            {unconfirmed && <ToConfirm className="justify-self-start" />}
            <Price price={apartment.price} />
          </div>
        </div>
      </article>
    );
  }

  if (layout === "standard" || layout === "feature") {
    return (
      <article
        className={cx(
          "group relative grid content-start gap-5",
          layout === "feature" && "min-[56.25rem]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] min-[56.25rem]:items-end min-[56.25rem]:gap-12",
          ringed,
          className,
        )}
      >
        <div className="overflow-hidden">
          <CardPhoto photo={apartment.photo} layout={layout} />
        </div>
        <div className="grid content-start gap-3">
          {name}
          {unconfirmed && <ToConfirm className="justify-self-start" />}
          <p className="text-fg-2">
            {sleeps} · {apartment.beds}
          </p>
          {layout === "feature" && <p className={siteText.secondary}>{apartment.summary}</p>}
          {apartment.features.length > 0 && (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[0.9375rem] text-fg-2">
              {apartment.features.map((feature) => (
                <li key={feature.label} className="inline-flex items-center gap-2 before:size-1 before:bg-romaic-gold before:content-['']">
                  {feature.label}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-hairline pt-3.5">
            <Price price={apartment.price} />
            <span aria-hidden="true" className="inline-flex items-center gap-1.5 font-display text-[0.9375rem] font-semibold tracking-[0.04em] text-ink transition-colors group-hover:text-gold-text">
              View room
              <ArrowRight strokeWidth={1.5} className="size-4 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </article>
    );
  }

  // lead and compact: photo, name, then the detail and the price either side of a hairline.
  return (
    <article className={cx("group relative grid content-start gap-4", ringed, className)}>
      <div className="overflow-hidden">
        <CardPhoto photo={apartment.photo} layout={layout} />
      </div>
      {name}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-t border-hairline pt-3.5 text-[0.9375rem] leading-normal text-fg-2">
        <span className="grid gap-1.5">
          <span>{layout === "lead" ? apartment.summary : sleeps}</span>
          {unconfirmed && <ToConfirm className="justify-self-start" />}
        </span>
        <Price price={apartment.price} />
      </div>
    </article>
  );
}
