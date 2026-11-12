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
  focus,
}: {
  photo: StandIn;
  aspect?: string;
  sizes?: string;
  preload?: boolean;
  className?: string;
  /** The point to keep in frame when it's cropped, in percent from the top left. */
  focus?: { x: number; y: number };
}) {
  return (
    <figure data-placeholder="photo" className={cx("photo-frame @container relative w-full overflow-hidden", aspect, className)}>
      {photo.src ? (
        <Image
          src={photo.src}
          alt={photo.alt}
          fill
          sizes={sizes}
          preload={preload}
          className="object-cover"
          style={focus ? { objectPosition: `${focus.x}% ${focus.y}%` } : undefined}
        />
      ) : (
        <div role="img" aria-label={photo.alt} className="absolute inset-0 bg-[linear-gradient(160deg,var(--color-neutral-100),var(--color-neutral-200))]" />
      )}
      {/* One line at every size: "Stand-in" on a tiny thumbnail, "Stand-in photo" from 8rem wide, and the source from 15rem (it's always in the title). */}
      <figcaption title={`Stand-in photo · ${photo.source}`} className="absolute bottom-2 left-2 rounded-xs bg-midnight-navy/90 px-2 py-1 text-xs font-bold whitespace-nowrap text-white">
        <span className="@[8rem]:hidden">Stand-in</span>
        <span className="hidden @[8rem]:inline">Stand-in photo</span> <span className="hidden font-normal text-navy-200 @[15rem]:inline">· {photo.source}</span>
      </figcaption>
    </figure>
  );
}
