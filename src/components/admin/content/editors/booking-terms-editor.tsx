"use client";

import { Notice } from "@/components/ui/notice";
import { sectionHelp, type BookingTermsSection } from "@/lib/content/schema";
import { ContentText } from "../content-fields";
import { EditorPart, partsOf } from "../editor-part";

export const bookingTermsParts = partsOf({
  terms: "Booking terms",
});

const { part } = bookingTermsParts;

/** The owner's terms for direct bookings, shown on the policies page. Only the owner sees this editor. */
export function BookingTermsEditor({ data }: { data: BookingTermsSection }) {
  return (
    <EditorPart {...part.terms} description="Shown on the policies page for guests who book with you directly.">
      <Notice tone="warning" live="off" title="Only you can change these">
        {sectionHelp.bookingTerms}
      </Notice>
      <ContentText
        name="deposit"
        label="Deposit"
        limit="rule"
        multiline
        rows={3}
        optional
        defaultValue={data.deposit}
        hint="How much guests pay to secure a booking, and when."
      />
      <ContentText name="balance" label="Balance" limit="rule" multiline rows={3} optional defaultValue={data.balance} hint="When the rest is due." />
      <ContentText
        name="cancellation"
        label="Cancellation"
        limit="rule"
        multiline
        rows={3}
        optional
        defaultValue={data.cancellation}
        hint="What happens if a guest cancels, or doesn't arrive."
      />
      <ContentText
        name="payment"
        label="How guests can pay"
        limit="rule"
        multiline
        rows={3}
        optional
        defaultValue={data.payment}
        hint="Like EFT, card or cash."
      />
    </EditorPart>
  );
}
