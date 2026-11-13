"use client";

import { Switch } from "@/components/ui/fields";
import { listLimits } from "@/lib/content/limits";
import type { LocationSection, NearbyPlace } from "@/lib/content/schema";
import { ContentText } from "../content-fields";
import { EditorPart, partsOf } from "../editor-part";
import { ListEditor } from "../list-editor";

export const locationParts = partsOf({
  page: "Page heading",
  directions: "Getting here",
  nearby: "Nearby places",
});

const { part } = locationParts;

/** Whoever adds a place is saying it's there, so a new one starts confirmed. */
const newPlace = (): NearbyPlace => ({ name: "", kind: "", distance: "", confirmed: true });

/** The location page: where the guesthouse is, how to get there, and the places nearby. */
export function LocationEditor({ data }: { data: LocationSection }) {
  const { nearby } = data;
  return (
    <>
      <EditorPart {...part.page} description="The heading and introduction at the top of the location page. The address and map link come from Business details.">
        <ContentText name="heading" label="Heading" limit="heading" defaultValue={data.heading} />
        <ContentText name="intro" label="Introduction" limit="intro" multiline rows={3} optional defaultValue={data.intro} />
      </EditorPart>

      <EditorPart {...part.directions} description="How to find the guesthouse and where to park.">
        <ContentText name="directions" label="Directions" limit="passage" multiline rows={4} optional defaultValue={data.directions} />
      </EditorPart>

      <EditorPart {...part.nearby} description="Places guests may want to know about, with how far they are.">
        <ContentText name="nearby.heading" label="Heading" limit="heading" defaultValue={nearby.heading} />
        <ListEditor
          name="nearby.places"
          noun={{ one: "place", many: "places" }}
          items={nearby.places}
          limits={listLimits.nearbyPlaces}
          blank={newPlace}
          variant="card"
          rowTitle={({ item, added, index }) => (added || !item.name ? `Place ${index + 1}` : item.name)}
        >
          {({ item, path }) => (
            <>
              <ContentText name={`${path}.name`} label="Name" limit="label" defaultValue={item.name} />
              <div className="grid gap-5 sm:grid-cols-2">
                <ContentText name={`${path}.kind`} label="What it is" limit="label" defaultValue={item.kind} placeholder="e.g. Restaurant" />
                <ContentText
                  name={`${path}.distance`}
                  label="Distance"
                  limit="label"
                  optional
                  defaultValue={item.distance}
                  placeholder="e.g. About 300 m"
                  hint="Leave it empty if you don't know."
                />
              </div>
              <Switch
                name={`${path}.confirmed`}
                label="Confirmed"
                defaultChecked={item.confirmed}
                onLabel="Yes"
                offLabel="No"
                hint="Until it's confirmed, the site marks it “To confirm”."
              />
            </>
          )}
        </ListEditor>
        <ContentText
          name="nearby.note"
          label="Note under the list"
          limit="intro"
          multiline
          rows={2}
          optional
          defaultValue={nearby.note}
          hint="Like how the distances were measured."
        />
      </EditorPart>
    </>
  );
}
