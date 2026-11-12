"use client";

import { DateField } from "@/components/ui/fields";
import { sectionHelp, type BookSection } from "@/lib/content/schema";
import { ContentText } from "../content-fields";
import { EditorPart, partsOf } from "../editor-part";

export const bookParts = partsOf({
  page: "Book page",
  consent: "What guests agree to",
  confirmation: "After sending",
});

const { part } = bookParts;

/** The Book page's words, the consent guests give with a request, and what they see once it's sent. */
export function BookEditor({ data }: { data: BookSection }) {
  const { consent, confirmation } = data;
  return (
    <>
      <EditorPart {...part.page} description="The heading and introduction on the Book page, and the note above the request form.">
        <ContentText name="heading" label="Heading" limit="heading" defaultValue={data.heading} />
        <ContentText name="intro" label="Introduction" limit="intro" multiline rows={3} optional defaultValue={data.intro} />
        <ContentText
          name="requestNote"
          label="Note above the form"
          limit="intro"
          multiline
          rows={3}
          optional
          defaultValue={data.requestNote}
          hint="Say that it's a request, and how you'll reply."
        />
      </EditorPart>

      <EditorPart {...part.consent} description="The box guests tick before they send a request. POPIA asks for it.">
        <ContentText name="consent.label" label="Consent wording" limit="consent" multiline rows={3} defaultValue={consent.label} hint={sectionHelp.book} />
        <div className="grid gap-5 sm:grid-cols-2">
          <ContentText
            name="consent.version"
            label="Version"
            limit="version"
            defaultValue={consent.version}
            hint="Changes by itself when you change the wording."
          />
          <DateField name="consent.updatedOn" label="Last changed" defaultValue={consent.updatedOn} />
        </div>
      </EditorPart>

      <EditorPart {...part.confirmation} description="What guests see after they send a request, with their reference.">
        <ContentText name="confirmation.heading" label="Heading" limit="heading" defaultValue={confirmation.heading} />
        <ContentText
          name="confirmation.text"
          label="What happens next"
          limit="intro"
          multiline
          rows={3}
          optional
          defaultValue={confirmation.text}
        />
      </EditorPart>
    </>
  );
}
