"use client";

import { Select, Switch } from "@/components/ui/fields";
import { listLimits } from "@/lib/content/limits";
import type { FacilitiesSection, Facility, FacilityGroup } from "@/lib/content/schema";
import { contentIconOptions } from "../choices";
import { ContentText } from "../content-fields";
import { EditorPart, partsOf } from "../editor-part";
import { ListEditor } from "../list-editor";

export const facilitiesParts = partsOf({
  page: "Page heading",
  groups: "Facilities",
});

const { part } = facilitiesParts;

/** Whoever adds a facility is saying it's there, so a new one starts confirmed. */
const newFacility = (): Facility => ({ icon: "apartment", label: "", note: "", confirmed: true });

const newGroup = (): FacilityGroup => ({ title: "", items: [newFacility()] });

/** The facilities page: what the guesthouse offers, in named groups, each item with a gold icon. */
export function FacilitiesEditor({ data }: { data: FacilitiesSection }) {
  return (
    <>
      <EditorPart {...part.page} description="The heading and introduction at the top of the facilities page.">
        <ContentText name="heading" label="Heading" limit="heading" defaultValue={data.heading} />
        <ContentText name="intro" label="Introduction" limit="intro" multiline rows={3} optional defaultValue={data.intro} />
      </EditorPart>

      <EditorPart {...part.groups} description="Groups such as Comfort or Security, each with its facilities. The order here is the order on the page.">
        <ListEditor
          name="groups"
          noun={{ one: "group", many: "groups" }}
          items={data.groups}
          limits={listLimits.facilityGroups}
          blank={newGroup}
          variant="card"
          rowTitle={({ item, added, index }) => (added || !item.title ? `Group ${index + 1}` : item.title)}
        >
          {({ item, path }) => (
            <>
              <ContentText name={`${path}.title`} label="Group name" limit="heading" defaultValue={item.title} placeholder="e.g. Security" />
              <ListEditor
                name={`${path}.items`}
                noun={{ one: "facility", many: "facilities" }}
                items={item.items}
                limits={listLimits.facilities}
                blank={newFacility}
                variant="card"
                label="Facilities in this group"
                rowTitle={({ item: facility, added, index }) => (added || !facility.label ? `Facility ${index + 1}` : facility.label)}
              >
                {({ item: facility, path: facilityPath }) => (
                  <>
                    <div className="grid gap-5 sm:grid-cols-[12rem_minmax(0,1fr)]">
                      <Select name={`${facilityPath}.icon`} label="Icon" options={contentIconOptions} defaultValue={facility.icon} />
                      <ContentText name={`${facilityPath}.label`} label="Facility" limit="label" defaultValue={facility.label} />
                    </div>
                    <ContentText
                      name={`${facilityPath}.note`}
                      label="Note"
                      limit="label"
                      optional
                      defaultValue={facility.note}
                      hint="Like At an extra charge. Leave it empty for none."
                    />
                    <Switch
                      name={`${facilityPath}.confirmed`}
                      label="Confirmed"
                      defaultChecked={facility.confirmed}
                      onLabel="Yes"
                      offLabel="No"
                      hint="Until it's confirmed, the site marks it “To confirm”."
                    />
                  </>
                )}
              </ListEditor>
            </>
          )}
        </ListEditor>
      </EditorPart>
    </>
  );
}
