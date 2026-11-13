"use client";

import { Notice } from "@/components/ui/notice";
import { sectionHelp, type MessagesSection } from "@/lib/content/schema";
import { ContentText } from "../content-fields";
import { EditorPart, partsOf } from "../editor-part";

export const messagesParts = partsOf({
  messages: "WhatsApp messages",
});

const { part } = messagesParts;

/** The WhatsApp messages the team sends from a booking. Only the owner sees this editor. */
export function MessagesEditor({ data }: { data: MessagesSection }) {
  return (
    <EditorPart {...part.messages} description="Opened from a booking in WhatsApp, with its details filled in, for the team to check and send.">
      <Notice tone="warning" live="off" title="Only you can change these">
        {sectionHelp.messages}
      </Notice>
      <ContentText name="confirmation" label="Confirmation" limit="rule" max={1200} multiline rows={4} defaultValue={data.confirmation} hint="Sent once a booking is confirmed." />
      <ContentText name="directions" label="Directions" limit="rule" max={1200} multiline rows={4} defaultValue={data.directions} hint="How to find you and where to park." />
      <ContentText name="checkIn" label="Check-in details" limit="rule" max={1200} multiline rows={4} defaultValue={data.checkIn} hint="Sent a day or two before arrival." />
    </EditorPart>
  );
}
