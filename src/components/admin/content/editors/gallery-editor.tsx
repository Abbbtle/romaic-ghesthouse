"use client";

import { listLimits } from "@/lib/content/limits";
import type { GalleryPhoto, GallerySection } from "@/lib/content/schema";
import { ContentText } from "../content-fields";
import { EditorPart, partsOf } from "../editor-part";
import { ImageField, type UploadImage } from "../image-field";
import { ListEditor } from "../list-editor";

export const galleryParts = partsOf({
  page: "Page heading",
  photos: "Photos",
});

const { part } = galleryParts;

/** A photo row added to the gallery: no picture yet, so saving asks for one. */
const newGalleryPhoto = (): GalleryPhoto => ({ photo: { src: "", alt: "", width: 1, height: 1, focus: { x: 50, y: 50 } }, caption: "" });

/** The gallery page: its heading, then the photos in the order the page shows them. */
export function GalleryEditor({ data, upload }: { data: GallerySection; upload: UploadImage }) {
  return (
    <>
      <EditorPart {...part.page} description="The heading and introduction at the top of the gallery page.">
        <ContentText name="heading" label="Heading" limit="heading" defaultValue={data.heading} />
        <ContentText name="intro" label="Introduction" limit="intro" multiline rows={3} optional defaultValue={data.intro} />
      </EditorPart>

      <EditorPart {...part.photos} description="The photos on the gallery page, in this order. Stand-in photos stay labelled until you replace them.">
        <ListEditor
          name="photos"
          noun={{ one: "photo", many: "photos" }}
          items={data.photos}
          limits={listLimits.galleryPhotos}
          blank={newGalleryPhoto}
          variant="card"
          rowTitle={({ index }) => `Photo ${index + 1}`}
        >
          {({ item, path, index }) => (
            <>
              <ImageField
                name={`${path}.photo`}
                image={item.photo}
                label={`Photo ${index + 1}`}
                guidance="Landscape or portrait, at least 1600 px on the long side, in warm light."
                upload={upload}
              />
              <ContentText
                name={`${path}.caption`}
                label="Caption"
                limit="caption"
                optional
                defaultValue={item.caption}
                hint="A few words under the photo. Leave it empty for none."
              />
            </>
          )}
        </ListEditor>
      </EditorPart>
    </>
  );
}
