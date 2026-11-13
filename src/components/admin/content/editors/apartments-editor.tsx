"use client";

import { NumberField, Switch } from "@/components/ui/fields";
import { hintClasses, labelClasses } from "@/components/ui/form-controls";
import { Notice } from "@/components/ui/notice";
import { listLimits, textLimits } from "@/lib/content/limits";
import { apartmentPath } from "@/lib/content/pages";
import { sectionHelp, type Apartment, type ApartmentsSection, type ImageRef } from "@/lib/content/schema";
import { ContentText } from "../content-fields";
import { EditorPart, partsOf } from "../editor-part";
import { ImageField, type UploadImage } from "../image-field";
import { ListEditor } from "../list-editor";

export const apartmentsParts = partsOf({
  page: "Page heading",
  apartments: "Room types",
});

const { part } = apartmentsParts;

/** A new room type starts hidden and unconfirmed, so nothing half-written reaches the site. */
const newApartment = (): Apartment => ({
  slug: "",
  name: "",
  summary: "",
  description: "",
  sleeps: 2,
  beds: "",
  bathroom: "",
  view: "",
  features: [],
  accessibility: "",
  photos: [],
  confirmed: false,
  published: false,
});

/** A photo row added to a list: no picture yet, so saving asks for one. */
const newPhoto = (): ImageRef => ({ src: "", alt: "", width: 1, height: 1, focus: { x: 50, y: 50 } });

/** The rooms: the page's heading, then each room type's details, photos and whether it's on the site. */
export function ApartmentsEditor({ data, upload }: { data: ApartmentsSection; upload: UploadImage }) {
  return (
    <>
      <EditorPart {...part.page} description="The heading and introduction at the top of the rooms page.">
        <ContentText name="heading" label="Heading" limit="heading" defaultValue={data.heading} />
        <ContentText name="intro" label="Introduction" limit="intro" multiline rows={3} optional defaultValue={data.intro} />
      </EditorPart>

      <EditorPart {...part.apartments} description="Each room type has its own card and page. The order here is the order on the site.">
        <Notice tone="info" live="off">
          {sectionHelp.apartments}
        </Notice>
        <ListEditor
          name="items"
          noun={{ one: "room type", many: "room types" }}
          items={data.items}
          limits={listLimits.apartments}
          blank={newApartment}
          variant="card"
          rowTitle={({ item, added, index }) => (added || !item.name ? `Room type ${index + 1}` : item.name)}
        >
          {({ item, path, added }) => (
            <>
              <div className="grid gap-1 rounded-sm border border-hairline bg-white px-3 py-1">
                <Switch
                  name={`${path}.published`}
                  label="Shown on the site"
                  defaultChecked={item.published}
                  onLabel="Shown"
                  offLabel="Hidden"
                  hint="Hidden room types aren't on the site or offered on the Book page."
                />
                <Switch
                  name={`${path}.confirmed`}
                  label="Details confirmed"
                  defaultChecked={item.confirmed}
                  onLabel="Yes"
                  offLabel="No"
                  hint="Until this is on, the site marks the beds, bathroom, features and who it sleeps “To confirm”."
                />
              </div>

              <ContentText name={`${path}.name`} label="Name" limit="label" defaultValue={item.name} placeholder="e.g. Family room" />
              {added ? (
                <ContentText
                  name={`${path}.slug`}
                  label="Link name"
                  limit="slug"
                  defaultValue={item.slug}
                  placeholder="e.g. family-room"
                  hint="Lower-case letters, numbers and dashes. It becomes the page's address, and it can't be changed once saved."
                />
              ) : (
                <SavedSlug name={`${path}.slug`} slug={item.slug} />
              )}
              <ContentText
                name={`${path}.summary`}
                label="Summary"
                limit="listLine"
                max={textLimits.listLine * 2}
                multiline
                rows={2}
                defaultValue={item.summary}
                hint="One sentence for the room's card."
              />

              <div className="grid gap-5 sm:grid-cols-[10rem_minmax(0,1fr)]">
                <NumberField
                  name={`${path}.sleeps`}
                  label="Sleeps up to"
                  defaultValue={item.sleeps}
                  hint="1 to 12. The Book page offers it to groups up to this size."
                />
                <ContentText name={`${path}.beds`} label="Beds" limit="listLine" defaultValue={item.beds} placeholder="e.g. 1 single and 1 large double" />
              </div>
              <ContentText name={`${path}.bathroom`} label="Bathroom" limit="listLine" defaultValue={item.bathroom} placeholder="e.g. Private, with a shower" />
              <ContentText
                name={`${path}.view`}
                label="View"
                limit="label"
                optional
                defaultValue={item.view}
                hint="Like Inner courtyard. Leave it empty if there's nothing to say."
              />
              <ContentText
                name={`${path}.description`}
                label="Description"
                limit="passage"
                multiline
                rows={5}
                optional
                defaultValue={item.description}
                hint="A paragraph or two for the room's own page."
              />

              <ListEditor
                name={`${path}.features`}
                noun={{ one: "feature", many: "features" }}
                items={item.features}
                limits={listLimits.apartmentFeatures}
                blank={() => ""}
                label="Features"
                hint="Short and specific, like Kitchenette with fridge, microwave and kettle."
              >
                {({ item: feature, path: featurePath, index }) => (
                  <ContentText name={featurePath} label={`Feature ${index + 1}`} hideLabel limit="label" defaultValue={feature} />
                )}
              </ListEditor>

              <ContentText
                name={`${path}.accessibility`}
                label="Accessibility"
                limit="rule"
                multiline
                rows={3}
                optional
                defaultValue={item.accessibility}
                hint="What a guest with a disability needs to know, exactly as it is, including what you haven't checked yet. Leave it empty if there's nothing special."
              />

              <ListEditor
                name={`${path}.photos`}
                noun={{ one: "photo", many: "photos" }}
                items={item.photos}
                limits={listLimits.apartmentPhotos}
                blank={newPhoto}
                variant="card"
                label="Photos"
                hint="The first photo is the one on the room's card."
              >
                {({ item: photo, path: photoPath, index }) => (
                  <ImageField
                    name={photoPath}
                    image={photo}
                    label={`Photo ${index + 1}`}
                    guidance="Landscape, at least 1600 × 1200 px, in warm light."
                    upload={upload}
                  />
                )}
              </ListEditor>
            </>
          )}
        </ListEditor>
      </EditorPart>
    </>
  );
}

/** A saved room type's link name: shown, not edited, because its page address and its units depend on it. */
function SavedSlug({ name, slug }: { name: string; slug: string }) {
  return (
    <div>
      <p className={labelClasses}>Link name</p>
      <p className="mt-1.5 text-base break-all text-ink">{apartmentPath(slug)}</p>
      <p className={hintClasses}>Fixed once saved: the room&apos;s page address and its units depend on it.</p>
      <input type="hidden" name={name} value={slug} />
    </div>
  );
}
