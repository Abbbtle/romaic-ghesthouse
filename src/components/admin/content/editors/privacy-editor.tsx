"use client";

import { DateField } from "@/components/ui/fields";
import { sectionHelp, type PrivacySection } from "@/lib/content/schema";
import { ContentText } from "../content-fields";
import { EditorPart, partsOf } from "../editor-part";

export const privacyParts = partsOf({
  notice: "Privacy notice",
  version: "Version and date",
});

const { part } = privacyParts;

/** The Privacy Notice page, in limited Markdown, with its version and date. */
export function PrivacyEditor({ data }: { data: PrivacySection }) {
  return (
    <>
      <EditorPart
        {...part.notice}
        description="POPIA asks you to tell guests what you do with their details. Fill in every part marked To be completed, and have it checked before you change what it promises."
      >
        <ContentText name="heading" label="Page title" limit="privacyHeading" defaultValue={data.heading} />
        <ContentText name="body" label="The notice" limit="privacyBody" multiline rows={24} defaultValue={data.body} hint={sectionHelp.privacy} />
      </EditorPart>

      <EditorPart {...part.version} description="Both change by themselves when you change the notice. Set them yourself only to correct them.">
        <div className="grid gap-5 sm:grid-cols-2">
          <ContentText name="version" label="Version" limit="version" defaultValue={data.version} />
          <DateField name="updatedOn" label="Last updated" defaultValue={data.updatedOn} />
        </div>
      </EditorPart>
    </>
  );
}
