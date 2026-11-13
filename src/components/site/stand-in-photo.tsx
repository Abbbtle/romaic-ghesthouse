import Image from "next/image";
import { cx } from "@/components/ui/cx";

export type StandIn = {
  /** A file in public/stand-ins/, or omit for a plain block. */
  src?: string;
  /** What the photo shows, for screen readers. Never says it's Romaic. */
  alt: string;
  /** Where it's from, such as "Pexels 1743229". Shown on the photo. */
  source: string;
  width?: number;
  height?: number;
};

/**
 * The quiet line that says a photo is a stand-in, on the photo's own face:
 * small light type over a soft shadow along the bottom edge, so it reads on
 * any photo without a badge. One line at every size: "Stand-in" on a tiny
 * thumbnail, "Stand-in photo" from 8rem wide, and the source from 15rem
 * (it's always in the title). Its figure must be a size container
 * (@container). With `placement="custom"` it drops its shadowed strip and
 * the caller places it, as the home hero does over its own dark gradient.
 */
export function StandInCaption({ source, placement = "foot", className }: { source: string; placement?: "foot" | "custom"; className?: string }) {
  return (
    <figcaption
      title={`Stand-in photo · ${source}`}
      className={cx(
        "pointer-events-none font-sans text-[0.75rem] leading-none font-normal tracking-[0.02em] whitespace-nowrap text-on-navy",
        placement === "foot" && "absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,rgb(10_17_25/0.62),rgb(10_17_25/0))] px-3 pt-7 pb-2.5",
        className,
      )}
    >
      <span className="@[8rem]:hidden">Stand-in</span>
      <span className="hidden @[8rem]:inline">Stand-in photo</span>
      <span className="hidden text-on-navy-2 @[15rem]:inline"> · {source}</span>
    </figcaption>
  );
}

/**
 * A stand-in for a photo the client hasn't supplied yet. It sits like a
 * real photo, but says quietly on its face that it's a stand-in and where
 * it's from, so nobody mistakes it for Romaic. Marked data-placeholder so a
 * check can list every stand-in before launch.
 */
export function StandInPhoto({
  photo,
  aspect = "aspect-4/3",
  sizes = "(min-width: 1024px) 50vw, 100vw",
  preload = false,
  className,
  imageClassName,
  focus,
}: {
  photo: StandIn;
  aspect?: string;
  sizes?: string;
  preload?: boolean;
  className?: string;
  /** Classes for the image itself, such as a hover zoom. */
  imageClassName?: string;
  /** The point to keep in frame when it's cropped, in percent from the top left. */
  focus?: { x: number; y: number };
}) {
  return (
    <figure data-placeholder="photo" className={cx("photo-frame @container relative m-0 w-full overflow-hidden", aspect, className)}>
      {photo.src ? (
        <Image
          src={photo.src}
          alt={photo.alt}
          fill
          sizes={sizes}
          preload={preload}
          className={cx("object-cover", imageClassName)}
          style={focus ? { objectPosition: `${focus.x}% ${focus.y}%` } : undefined}
        />
      ) : (
        <div role="img" aria-label={photo.alt} className="absolute inset-0 bg-[linear-gradient(160deg,var(--color-neutral-100),var(--color-neutral-200))]" />
      )}
      <StandInCaption source={photo.source} />
    </figure>
  );
}
