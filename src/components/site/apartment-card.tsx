import { ArrowRight, Bath, BedDouble, CookingPot, Users, Wifi } from "lucide-react";
import Link from "next/link";
import { cx } from "@/components/ui/cx";
import type { ImageRef } from "@/lib/content/schema";
import { ContentPhoto } from "./content-photo";
import { ToConfirm } from "./to-confirm";

export type ApartmentSummary = {
  name: string;
  href: string;
  sleeps: number;
  beds: string;
  /** The first photo; null shows a framed gap that says a photo is to come. */
  photo: ImageRef | null;
  /** The owner has checked these details; otherwise they're marked "To confirm". */
  confirmed?: boolean;
  /** Short facts, each a few words: "Kitchenette", "Private bathroom". */
  features: readonly { label: string; icon: "kitchen" | "bath" | "wifi" }[];
  /** The apartment's rate, already worded ("From R850 a night"), or null while there's none. */
  price: string | null;
};

const featureIcons = { kitchen: CookingPot, bath: Bath, wifi: Wifi } as const;

/**
 * One apartment in the list: framed photo, name, who it sleeps and on what
 * beds, a few facts, the price (or a marked gap), and one link to its page.
 * Every card has the same anatomy in the same places, so guests can compare
 * apartments at a glance. The whole card is the link's target area.
 */
export function ApartmentCard({ apartment, className }: { apartment: ApartmentSummary; className?: string }) {
  return (
    <article className={cx("group relative grid content-start gap-4", className)}>
      {apartment.photo ? (
        <ContentPhoto image={apartment.photo} sizes="(min-width: 1024px) 22rem, (min-width: 640px) 50vw, calc(100vw - 2rem)" />
      ) : (
        <div data-placeholder="photo" className="photo-frame flex aspect-4/3 items-center justify-center bg-neutral-100 text-sm text-fg-3">
          Photo to come
        </div>
      )}
      <div className="grid gap-2">
        <h3 className="text-h3 font-bold text-ink">
          <Link href={apartment.href} className="underline-offset-4 group-hover:underline after:absolute after:inset-0">
            {apartment.name}
          </Link>
        </h3>
        {apartment.confirmed === false && <ToConfirm className="justify-self-start" />}
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-fg-2">
          <span className="inline-flex items-center gap-1.5">
            <Users aria-hidden="true" strokeWidth={1.5} className="size-4 text-gold-text" />
            Sleeps up to {apartment.sleeps}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <BedDouble aria-hidden="true" strokeWidth={1.5} className="size-4 text-gold-text" />
            {apartment.beds}
          </span>
        </p>
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-fg-2">
        {apartment.features.map((feature) => {
          const Icon = featureIcons[feature.icon];
          return (
            <li key={feature.label} className="inline-flex items-center gap-1.5">
              <Icon aria-hidden="true" strokeWidth={1.5} className="size-4 text-gold-text" />
              {feature.label}
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between gap-4 border-t border-hairline pt-3">
        {apartment.price ? (
          <p className="text-lg font-bold text-ink" data-numeric>
            {apartment.price}
          </p>
        ) : (
          <p data-placeholder="price" className="text-sm text-fg-3">
            Price on request
          </p>
        )}
        <span aria-hidden="true" className="inline-flex items-center gap-1.5 text-sm font-bold text-link group-hover:text-link-hover">
          View room
          <ArrowRight strokeWidth={1.75} className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" />
        </span>
      </div>
    </article>
  );
}
