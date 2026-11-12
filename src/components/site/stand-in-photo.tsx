import Image from "next/image";
import { cx } from "@/components/ui/cx";

export type StandIn = {
  /** A file in public/stand-ins/, or omit for a plain framed block. */
  src?: string;
  /** What the photo shows, for screen readers. Never says it's Romaic. */
  alt: string;
  /** Where it's from, such as "Pexels 1743229". Shown on the photo. */
  source: string;
  width?: number;
  height?: number;
};

/**
 * A stand-in for a photo the client hasn't supplied yet. It wears the gold
 * frame like a real photo, but says on its face that it's a stand-in and
 * where it's from, so nobody mistakes it for Romaic. Marked data-placeholder
 * so a check can list every stand-in before launch.
 */
export function StandInPhoto({
  photo,
  aspect = "aspect-4/3",
  sizes = "(min-width: 1024px) 50vw, 100vw",
  preload = false,
  className,
}: {
  photo: StandIn;
  aspect?: string;
  sizes?: string;
  preload?: boolean;
  className?: string;
}) {
  return (
    <figure data-placeholder="photo" className={cx("photo-frame relative w-full overflow-hidden", aspect, className)}>
      {photo.src ? (
        <Image src={photo.src} alt={photo.alt} fill sizes={sizes} preload={preload} className="object-cover" />
      ) : (
        <div role="img" aria-label={photo.alt} className="absolute inset-0 bg-[linear-gradient(160deg,var(--color-neutral-100),var(--color-neutral-200))]" />
      )}
      <figcaption className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-xs bg-midnight-navy/90 px-2 py-1 text-xs font-bold text-white">
        Stand-in photo <span className="font-normal text-navy-200">· {photo.source}</span>
      </figcaption>
    </figure>
  );
}
