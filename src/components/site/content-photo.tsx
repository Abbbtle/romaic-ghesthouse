import { Photo, type PhotoAspect } from "@/components/ui/photo";
import { standInSource, type ImageRef } from "@/lib/content/schema";
import { StandInPhoto } from "./stand-in-photo";

const aspectClasses: Record<PhotoAspect, string> = {
  "4/5": "aspect-4/5",
  "1/1": "aspect-square",
  "3/2": "aspect-3/2",
  "4/3": "aspect-4/3",
  "16/9": "aspect-video",
};

/**
 * A photo from the site's content, in the gold frame. A stand-in (one of
 * the labelled placeholders under /stand-ins/) says so on its face, with its
 * source, and is marked data-placeholder; a real photo shows as it is. The
 * label comes from the photo's address, so it can't be switched off by
 * accident: replacing the photo in the dashboard is what removes it.
 */
export function ContentPhoto({
  image,
  sizes,
  aspect = "4/3",
  preload = false,
  className,
}: {
  image: ImageRef;
  sizes: string;
  aspect?: PhotoAspect;
  preload?: boolean;
  className?: string;
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
        focus={image.focus}
      />
    );
  }
  return <Photo image={image} sizes={sizes} aspect={aspect} preload={preload} className={className} />;
}
