"use client";

import { Select } from "@/components/ui/fields";
import { listLimits } from "@/lib/content/limits";
import type { Highlight, HomeSection } from "@/lib/content/schema";
import { contentIconOptions } from "../choices";
import { ContentText } from "../content-fields";
import { EditorPart, partsOf } from "../editor-part";
import { ImageField, type UploadImage } from "../image-field";
import { ListEditor } from "../list-editor";

export const homeParts = partsOf({
  hero: "First screen",
  apartments: "Rooms",
  highlights: "Highlights",
  location: "Where to find us",
});

const { part } = homeParts;

const newHighlight = (): Highlight => ({ icon: "apartment", title: "", lines: [""] });

/** The home page: the first screen guests see, then the rooms, the highlights and where to find the guesthouse. */
export function HomeEditor({ data, upload }: { data: HomeSection; upload: UploadImage }) {
  const { hero, apartments, highlights, location } = data;
  return (
    <>
      <EditorPart {...part.hero} description="The first thing guests see: the photo, the headline in the gold bar, and a sentence or two about the guesthouse.">
        <ContentText
          name="hero.headline"
          label="Headline"
          limit="goldBar"
          defaultValue={hero.headline}
          hint="Shown in the gold bar. Short lines fit best on phones."
        />
        <ContentText name="hero.lead" label="Introduction" limit="lead" multiline rows={3} defaultValue={hero.lead} />
        <ContentText
          name="hero.welcome"
          label="Welcome line"
          limit="script"
          optional
          defaultValue={hero.welcome}
          hint="A few words in large gold script, like Welcome home. Leave it empty to leave it out."
        />
        <ImageField
          name="hero.photo"
          image={hero.photo}
          label="Main photo"
          guidance="Landscape, at least 1600 × 1200 px: a warm, well-lit photo of a room."
          upload={upload}
        />
      </EditorPart>

      <EditorPart {...part.apartments} description="The heading and introduction above the room cards. The rooms themselves are edited under Rooms.">
        <ContentText name="apartments.heading" label="Heading" limit="heading" defaultValue={apartments.heading} />
        <ContentText name="apartments.intro" label="Introduction" limit="intro" multiline rows={3} optional defaultValue={apartments.intro} />
      </EditorPart>

      <EditorPart {...part.highlights} description="What keeps working at the guesthouse, shown as rows with gold icons.">
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
              <div className="grid gap-5 sm:grid-cols-[12rem_minmax(0,1fr)]">
                <Select name={`${path}.icon`} label="Icon" options={contentIconOptions} defaultValue={item.icon} />
                <ContentText name={`${path}.title`} label="Title" limit="label" defaultValue={item.title} placeholder="e.g. In your room" />
              </div>
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
      </EditorPart>

      <EditorPart {...part.location} description="A short section about where the guesthouse is. The address comes from Business details.">
        <ContentText name="location.heading" label="Heading" limit="heading" defaultValue={location.heading} />
        <ContentText name="location.text" label="Text" limit="intro" multiline rows={3} optional defaultValue={location.text} />
      </EditorPart>
    </>
  );
}
