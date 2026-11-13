import { Photo, type PhotoAspect } from "@/components/ui/photo";
import { standInSource, type ImageRef } from "@/lib/content/schema";
import { StandInPhoto } from "./stand-in-photo";

const aspectClasses: Record<PhotoAspect, string> = {
  "4/5": "aspect-4/5",
  "1/1": "aspect-square",
  "3/2": "aspect-3/2",
  "4/3": "aspect-4/3",
  "16/9": "aspect-video",
  free: "",
};

/**
 * A photo from the site's content. A stand-in (one of the labelled
 * placeholders under /stand-ins/) says so quietly on its face, with its
 * source, and is marked data-placeholder; a real photo shows as it is. The
 * label comes from the photo's address, so it can't be switched off by
 * accident: replacing the photo in the dashboard is what removes it. For
 * the offset gold hairline, use FramedPhoto.
 */
export function ContentPhoto({
  image,
  sizes,
  aspect = "4/3",
  preload = false,
  className,
  imageClassName,
}: {
  image: ImageRef;
  sizes: string;
  aspect?: PhotoAspect;
  preload?: boolean;
  className?: string;
  /** Classes for the image itself, such as a hover zoom. */
  imageClassName?: string;
}) {
  const source = standInSource(image.src);
  if (source) {
    return (
      <StandInPhoto
        photo={{ src: image.src, alt: image.alt, source, width: image.width, height: image.height }}
        aspect={aspectClasses[aspect]}
        sizes={sizes}
        preload={preload}
        className={className}
        imageClassName={imageClassName}
        focus={image.focus}
      />
    );
  }
  return <Photo image={image} sizes={sizes} aspect={aspect} preload={preload} className={className} imageClassName={imageClassName} />;
}

/**
 * A large photo in the approved design's frame: a gold hairline set off its
 * edge, down and to the right (`.framed` in globals.css). For the house
 * photo on the home page and the lead photo on a room's page.
 */
export function FramedPhoto({ className, ...photo }: Parameters<typeof ContentPhoto>[0]) {
  return (
    <div className={`framed ${className ?? ""}`}>
      <ContentPhoto {...photo} />
    </div>
  );
}
