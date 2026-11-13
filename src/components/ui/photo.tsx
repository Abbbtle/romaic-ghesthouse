import Image from "next/image";
import { cx } from "./cx";

/**
 * A photo as content stores it (the content core's ImageRef): a /images/… or
 * /media/… path, alt text, its pixel size, and the point to keep in frame
 * when it's cropped, in percent from the top left.
 */
export type PhotoSource = {
  src: string;
  alt: string;
  width: number;
  height: number;
  focus?: { x: number; y: number };
};

/** "free" sets no ratio: the caller sizes the photo, such as one filling the height of a card. */
export type PhotoAspect = "4/5" | "1/1" | "3/2" | "4/3" | "16/9" | "free";

const aspects: Record<PhotoAspect, string> = {
  "4/5": "aspect-4/5",
  "1/1": "aspect-square",
  "3/2": "aspect-3/2",
  "4/3": "aspect-4/3",
  "16/9": "aspect-video",
  free: "",
};

/** Kept for older callers that passed a corner size; any value other than "none" now means the gold frame. */
export type CornerSize = "sm" | "md" | "lg";

type PhotoProps = {
  image: PhotoSource;
  /** The rendered width at each breakpoint, e.g. "(min-width: 1024px) 50vw, 100vw". */
  sizes: string;
  /** Preloads the image. Only for the largest image above the fold (the home hero). */
  preload?: boolean;
  aspect?: PhotoAspect;
  /** The thin gold frame every photo wears on the public site (brand guide p7). On by default. */
  frame?: boolean;
  /** Deprecated: use `frame`. "none" turns the frame off. */
  corner?: CornerSize | "none";
  /** Sizing beyond the aspect ratio, such as a maximum height. */
  className?: string;
  /** Classes for the image itself, such as a hover zoom. */
  imageClassName?: string;
};

/**
 * A content photo cropped to fill its frame around its focus point, in true
 * colour: no tint, no overlay, no text on it. Until it loads, the frame
 * shows a quiet Cream at the final size, so nothing shifts.
 */
export function Photo({ image, sizes, preload = false, aspect = "4/3", frame, corner, className, imageClassName }: PhotoProps) {
  const framed = frame ?? corner !== "none";
  return (
    <div className={cx("relative w-full overflow-hidden bg-media", aspects[aspect], framed && "photo-frame", className)}>
      <Image
        src={image.src}
        alt={image.alt}
        fill
        sizes={sizes}
        preload={preload}
        className={cx("object-cover", imageClassName)}
        style={image.focus ? { objectPosition: `${image.focus.x}% ${image.focus.y}%` } : undefined}
      />
    </div>
  );
}
