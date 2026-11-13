"use client";

import { listLimits } from "@/lib/content/limits";
import type { Highlight, HomeSection, ImageRef } from "@/lib/content/schema";
import { ContentText } from "../content-fields";
import { EditorPart, partsOf } from "../editor-part";
import { ImageField, type UploadImage } from "../image-field";
import { ListEditor } from "../list-editor";

/** The parts in the order the home page shows them. */
export const homeParts = partsOf({
  hero: "First screen",
  highlights: "Highlights",
  apartments: "Rooms",
  evenings: "Evenings",
  location: "Where to find us",
  closing: "Invitation to book",
});

const { part } = homeParts;

/** A photo not chosen yet: the field says so, and saving asks for one. */
const noPhoto = (): ImageRef => ({ src: "", alt: "", width: 1, height: 1, focus: { x: 50, y: 50 } });

/** The home page shows no icons now, so a new highlight takes the one the content model needs and nobody sees. */
const newHighlight = (): Highlight => ({ icon: "apartment", title: "", lines: [""] });

/** The evening band's photos by place: the first is shown large, the second small over its corner. */
const eveningPhotoSpots = [
  { label: "Large photo", guidance: "Landscape, at least 1600 × 1200 px: shown wide beside the times, with a gold corner frame." },
  { label: "Small photo", guidance: "Square, at least 1000 × 1000 px: shown small over the bottom corner of the large photo." },
] as const;

/**
 * The home page, part by part in the order guests scroll through it: the
 * first screen, the highlights beside the house photo, the rooms, the
 * evening band, where to find the guesthouse, and the closing invitation.
 * The house photo and the evening band are optional in the content model,
 * but the content service fills them from the defaults whenever they're
 * missing, so here they're always present; the fallbacks only satisfy the
 * types.
 */
export function HomeEditor({ data, upload }: { data: HomeSection; upload: UploadImage }) {
  const { hero, apartments, highlights, location } = data;
  const evenings = data.evenings ?? { heading: "", intro: "", photos: [] };
  return (
    <>
      <EditorPart {...part.hero} description="The first thing guests see: a photo across the whole screen, with the headline and a sentence or two about the guesthouse over it.">
        <ContentText
          name="hero.headline"
          label="Headline"
          limit="heroHeadline"
          defaultValue={hero.headline}
          hint="Set large over the photo. Short headlines fit best on phones."
        />
        <ContentText name="hero.lead" label="Introduction" limit="lead" multiline rows={3} defaultValue={hero.lead} />
        <ImageField
          name="hero.photo"
          image={hero.photo}
          label="Main photo"
          guidance="Landscape, at least 2000 px wide: a warm, well-lit photo. It's darkened where the words sit so they stay readable, and phones show a narrower crop."
          upload={upload}
        />
      </EditorPart>

      <EditorPart {...part.highlights} description="What the guesthouse offers, listed beside a framed photo, with a link to the Facilities page.">
        <ContentText name="highlights.heading" label="Heading" limit="heading" defaultValue={highlights.heading} />
        <ContentText name="highlights.intro" label="Introduction" limit="intro" multiline rows={3} optional defaultValue={highlights.intro} />
        <ListEditor
          name="highlights.items"
          noun={{ one: "highlight", many: "highlights" }}
          items={highlights.items}
          limits={listLimits.highlights}
          blank={newHighlight}
          variant="card"
          rowTitle={({ item, added, index }) => (added || !item.title ? `Highlight ${index + 1}` : item.title)}
        >
          {({ item, path }) => (
            <>
              <input type="hidden" name={`${path}.icon`} value={item.icon} />
              <ContentText name={`${path}.title`} label="Title" limit="label" defaultValue={item.title} placeholder="e.g. In your room" />
              <ListEditor
                name={`${path}.lines`}
                noun={{ one: "line", many: "lines" }}
                items={item.lines}
                limits={listLimits.highlightLines}
                blank={() => ""}
                label="Lines"
              >
                {({ item: line, path: linePath, index }) => (
                  <ContentText name={linePath} label={`Line ${index + 1}`} hideLabel limit="listLine" defaultValue={line} />
                )}
              </ListEditor>
            </>
          )}
        </ListEditor>
        <ImageField
          name="highlights.photo"
          image={highlights.photo ?? noPhoto()}
          label="House photo"
          guidance="Portrait, at least 1200 × 1500 px: shown upright beside the highlights, with a gold frame set behind it."
          upload={upload}
        />
      </EditorPart>

      <EditorPart {...part.apartments} description="The heading and introduction above the room cards. The rooms themselves are edited under Rooms.">
        <ContentText name="apartments.heading" label="Heading" limit="heading" defaultValue={apartments.heading} />
        <ContentText name="apartments.intro" label="Introduction" limit="intro" multiline rows={3} optional defaultValue={apartments.intro} />
      </EditorPart>

      <EditorPart
        {...part.evenings}
        description="A dark band after the rooms with the check-in and check-out times, which come from House rules, and up to two photos."
      >
        <ContentText name="evenings.heading" label="Heading" limit="heading" defaultValue={evenings.heading} />
        <ContentText name="evenings.intro" label="Introduction" limit="intro" multiline rows={3} optional defaultValue={evenings.intro} />
        <ListEditor
          name="evenings.photos"
          noun={{ one: "photo", many: "photos" }}
          items={evenings.photos}
          limits={listLimits.eveningPhotos}
          blank={noPhoto}
          variant="card"
          rowTitle={({ index }) => eveningPhotoSpots[index]?.label ?? `Photo ${index + 1}`}
          hint="The first photo is shown large and the second small over its corner. With no photos, the band shows its words and the times on their own."
        >
          {({ item, path, index }) => (
            <ImageField
              name={path}
              image={item}
              label={eveningPhotoSpots[index]?.label ?? `Photo ${index + 1}`}
              guidance={eveningPhotoSpots[index]?.guidance ?? ""}
              upload={upload}
            />
          )}
        </ListEditor>
      </EditorPart>

      <EditorPart {...part.location} description="A few words on where the guesthouse is, under the address near the end of the page. The address comes from Business details.">
        <ContentText name="location.heading" label="Heading" limit="heading" defaultValue={location.heading} />
        <ContentText name="location.text" label="Text" limit="intro" multiline rows={3} optional defaultValue={location.text} />
      </EditorPart>

      <EditorPart {...part.closing} description="The last section of the home page, with the button to check availability. The words beside the heading come from Booking form.">
        <ContentText
          name="hero.welcome"
          label="Heading"
          limit="closingHeading"
          optional
          defaultValue={hero.welcome}
          hint="A few words, like Welcome home. Leave it empty to use the heading from Booking form."
        />
      </EditorPart>
    </>
  );
}
