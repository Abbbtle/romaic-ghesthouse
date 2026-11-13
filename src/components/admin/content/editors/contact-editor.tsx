"use client";

import { PhoneField } from "@/components/ui/fields";
import { Notice } from "@/components/ui/notice";
import { sectionHelp, type ContactSection } from "@/lib/content/schema";
import { ContentText } from "../content-fields";
import { EditorPart, partsOf } from "../editor-part";

export const contactParts = partsOf({
  numbers: "Phone and WhatsApp",
  email: "Email",
  whatsapp: "WhatsApp message",
});

const { part } = contactParts;

/** How guests reach the guesthouse. Only the owner sees this editor. */
export function ContactEditor({ data }: { data: ContactSection }) {
  return (
    <>
      <EditorPart {...part.numbers} description="Used by every call and WhatsApp button on the site, and shown wherever your number appears.">
        <Notice tone="warning" live="off" title="Only you can change these">
          {sectionHelp.contact}
        </Notice>
        <PhoneField name="phone" label="Phone number" defaultValue={data.phone} hint="For calls, and for WhatsApp unless you add a separate number." />
        <PhoneField
          name="whatsapp"
          label="WhatsApp number"
          optional
          defaultValue={data.whatsapp ?? undefined}
          hint="Only if WhatsApp is on a different number."
        />
      </EditorPart>

      <EditorPart {...part.email} description="Shown on the site for guests who'd rather email.">
        <ContentText name="email" label="Email address" limit="email" type="email" inputMode="email" autoComplete="email" defaultValue={data.email} />
      </EditorPart>

      <EditorPart {...part.whatsapp} description="What a chat opens with when a guest taps WhatsApp on the site. They can change it before sending.">
        <ContentText name="whatsappMessage" label="Opening message" limit="whatsappMessage" multiline rows={3} defaultValue={data.whatsappMessage} />
      </EditorPart>
    </>
  );
}
