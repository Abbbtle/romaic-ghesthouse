"use client";

import type { ContactPageSection } from "@/lib/content/schema";
import { ContentText } from "../content-fields";
import { EditorPart, partsOf } from "../editor-part";

export const contactPageParts = partsOf({
  page: "Contact page",
});

const { part } = contactPageParts;

/** The contact page's words. The phone, WhatsApp and email come from Contact details, which only the owner changes. */
export function ContactPageEditor({ data }: { data: ContactPageSection }) {
  return (
    <EditorPart {...part.page} description="The words on the contact page. The phone number and email address come from Contact details.">
      <ContentText name="heading" label="Heading" limit="heading" defaultValue={data.heading} />
      <ContentText name="intro" label="Introduction" limit="intro" multiline rows={3} optional defaultValue={data.intro} />
      <ContentText
        name="responseNote"
        label="When you reply"
        limit="listLine"
        optional
        defaultValue={data.responseNote}
        hint="Like We reply between 08:00 and 20:00. Leave it empty to say nothing."
      />
    </EditorPart>
  );
}
