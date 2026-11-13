"use client";

import { Switch, TimeField } from "@/components/ui/fields";
import { listLimits } from "@/lib/content/limits";
import type { HouseRule, PoliciesSection, TimeWindow } from "@/lib/content/schema";
import { ContentText } from "../content-fields";
import { EditorPart, partsOf } from "../editor-part";
import { ListEditor } from "../list-editor";

export const policiesParts = partsOf({
  page: "Page heading",
  times: "Check-in and check-out",
  rules: "House rules",
});

const { part } = policiesParts;

/** Whoever adds a rule is setting it, so a new one starts confirmed. */
const newRule = (): HouseRule => ({ title: "", text: "", confirmed: true });

/** The policies page: check-in and check-out times, then the house rules. Booking terms are the owner's, under Booking terms. */
export function PoliciesEditor({ data }: { data: PoliciesSection }) {
  return (
    <>
      <EditorPart {...part.page} description="The heading and introduction at the top of the policies page.">
        <ContentText name="heading" label="Heading" limit="heading" defaultValue={data.heading} />
        <ContentText name="intro" label="Introduction" limit="intro" multiline rows={3} optional defaultValue={data.intro} />
      </EditorPart>

      <EditorPart {...part.times} description="On the 24-hour clock. Shown on the policies page and the booking form.">
        <TimeWindowFields name="checkIn" title="Check-in" window={data.checkIn} />
        <TimeWindowFields name="checkOut" title="Check-out" window={data.checkOut} />
      </EditorPart>

      <EditorPart {...part.rules} description="Each rule has a short title and a sentence or two. The order here is the order on the page.">
        <ListEditor
          name="rules"
          noun={{ one: "rule", many: "rules" }}
          items={data.rules}
          limits={listLimits.rules}
          blank={newRule}
          variant="card"
          rowTitle={({ item, added, index }) => (added || !item.title ? `Rule ${index + 1}` : item.title)}
        >
          {({ item, path }) => (
            <>
              <ContentText name={`${path}.title`} label="Title" limit="label" defaultValue={item.title} placeholder="e.g. Pets" />
              <ContentText name={`${path}.text`} label="Rule" limit="rule" multiline rows={3} defaultValue={item.text} />
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
      </EditorPart>
    </>
  );
}

/** A time window, such as check-in from 15:00 until 21:00, and whether it's confirmed. */
function TimeWindowFields({ name, title, window }: { name: string; title: string; window: TimeWindow }) {
  return (
    <fieldset className="grid gap-4 rounded-md border border-hairline bg-neutral-25 p-3 sm:p-4">
      <legend className="px-1 text-base font-bold text-ink">{title}</legend>
      <div className="grid gap-5 sm:grid-cols-2">
        <TimeField name={`${name}.from`} label="From" defaultValue={window.from} />
        <TimeField name={`${name}.until`} label="Until" defaultValue={window.until} />
      </div>
      <Switch
        name={`${name}.confirmed`}
        label="Confirmed"
        defaultChecked={window.confirmed}
        onLabel="Yes"
        offLabel="No"
        hint="Until it's confirmed, the site marks these times “To confirm”."
      />
    </fieldset>
  );
}
