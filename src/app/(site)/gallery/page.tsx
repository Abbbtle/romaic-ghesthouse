import type { Metadata } from "next";
import { ContentPhoto } from "@/components/site/content-photo";
import { PageBand, PageHeading } from "@/components/site/page-heading";
import { getSiteContent } from "@/server/site-content";
import { pageMetadata } from "../page-metadata";

/** Read per request with the content as it is now, like every public page (see ../layout.tsx), so it may wait for it. */
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("gallery");
}

/** The gallery: every photo in its gold frame, with its caption where it has one. Stand-ins say so on their faces. */
export default async function GalleryPage() {
  const { gallery } = await getSiteContent();
  return (
    <main id="main" className="flex-1">
      <PageBand tone="cream">
        <PageHeading title={gallery.heading} intro={gallery.intro} />
      </PageBand>
      <PageBand>
        <h2 className="sr-only">Photos</h2>
        {gallery.photos.length > 0 ? (
          <ul className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {gallery.photos.map(({ photo, caption }, index) => (
              // The first photo leads at double size from 1024 px, which also keeps ten photos from leaving one alone on the last row.
              <li key={photo.src} className={index === 0 && gallery.photos.length % 3 === 1 ? "lg:col-span-2 lg:row-span-2" : undefined}>
                <figure className="grid gap-2">
                  <ContentPhoto image={photo} sizes="(min-width: 1024px) 22rem, (min-width: 640px) 50vw, calc(100vw - 2rem)" />
                  {caption && <figcaption className="text-sm text-fg-2">{caption}</figcaption>}
                </figure>
              </li>
            ))}
          </ul>
        ) : (
          <p data-placeholder="photo" className="text-base text-fg-3">
            Photos are on their way.
          </p>
        )}
      </PageBand>
    </main>
  );
}
