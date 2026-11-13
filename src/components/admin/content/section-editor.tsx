"use client";

import type { ReactNode } from "react";
import { Notice } from "@/components/ui/notice";
import type { SectionKey } from "@/lib/content/schema";
import { ContentNav } from "./content-nav";
import type { EditableContent } from "./editable-content";
import type { EditorPartLink } from "./editor-part";
import { ApartmentsEditor, apartmentsParts } from "./editors/apartments-editor";
import { BookEditor, bookParts } from "./editors/book-editor";
import { BookingTermsEditor, bookingTermsParts } from "./editors/booking-terms-editor";
import { ContactEditor, contactParts } from "./editors/contact-editor";
import { ContactPageEditor, contactPageParts } from "./editors/contact-page-editor";
import { FacilitiesEditor, facilitiesParts } from "./editors/facilities-editor";
import { GalleryEditor, galleryParts } from "./editors/gallery-editor";
import { HomeEditor, homeParts } from "./editors/home-editor";
import { LocationEditor, locationParts } from "./editors/location-editor";
import { MessagesEditor, messagesParts } from "./editors/messages-editor";
import { PoliciesEditor, policiesParts } from "./editors/policies-editor";
import { PrivacyEditor, privacyParts } from "./editors/privacy-editor";
import { SeoEditor, seoParts } from "./editors/seo-editor";
import { SiteEditor, siteParts } from "./editors/site-editor";
import type { UploadImage } from "./image-field";
import { SectionForm, type SaveSection } from "./section-form";

type SectionEditorProps = {
  content: EditableContent;
  /** The revision `content` is at; saves are only accepted over it. */
  revision: number;
  /** The saved version couldn't be read, so `content` is the default the site shows meanwhile. */
  recovered: boolean;
  save: SaveSection;
  /** Stores a photo chosen in an editor, for the section to save. */
  upload: UploadImage;
  /** The sections this person may edit, for the content nav. */
  available: readonly SectionKey[];
  /** The section's history, under the form. */
  history: ReactNode;
};

/** A section's editor beside the content nav: the parts of the form, the save bar, then the section's history. */
export function SectionEditor({ content, revision, recovered, save, upload, available, history }: SectionEditorProps) {
  const { parts, fields } = editorFor(content, upload);
  return (
    <div className="lg:grid lg:grid-cols-[13.75rem_minmax(0,40rem)] lg:gap-10">
      <ContentNav current={content.key} available={available} parts={parts} />
      <div className="grid min-w-0 gap-10">
        <div>
          {recovered && (
            <Notice tone="warning" live="off" title="This section's saved version couldn't be read" className="mb-6">
              You&apos;re seeing the content your site started with, which is also what visitors see now. Saving replaces the version that
              couldn&apos;t be read.
            </Notice>
          )}
          <SectionForm section={content.key} revision={revision} save={save}>
            {fields}
          </SectionForm>
        </div>
        {history}
      </div>
    </div>
  );
}

function editorFor(content: EditableContent, upload: UploadImage): { parts: readonly EditorPartLink[]; fields: ReactNode } {
  switch (content.key) {
    case "site":
      return { parts: siteParts.links, fields: <SiteEditor data={content.data} /> };
    case "contact":
      return { parts: contactParts.links, fields: <ContactEditor data={content.data} /> };
    case "bookingTerms":
      return { parts: bookingTermsParts.links, fields: <BookingTermsEditor data={content.data} /> };
    case "messages":
      return { parts: messagesParts.links, fields: <MessagesEditor data={content.data} /> };
    case "home":
      return { parts: homeParts.links, fields: <HomeEditor data={content.data} upload={upload} /> };
    case "apartments":
      return { parts: apartmentsParts.links, fields: <ApartmentsEditor data={content.data} upload={upload} /> };
    case "gallery":
      return { parts: galleryParts.links, fields: <GalleryEditor data={content.data} upload={upload} /> };
    case "facilities":
      return { parts: facilitiesParts.links, fields: <FacilitiesEditor data={content.data} /> };
    case "location":
      return { parts: locationParts.links, fields: <LocationEditor data={content.data} /> };
    case "policies":
      return { parts: policiesParts.links, fields: <PoliciesEditor data={content.data} /> };
    case "contactPage":
      return { parts: contactPageParts.links, fields: <ContactPageEditor data={content.data} /> };
    case "book":
      return { parts: bookParts.links, fields: <BookEditor data={content.data} /> };
    case "seo":
      return { parts: seoParts.links, fields: <SeoEditor data={content.data} /> };
    case "privacy":
      return { parts: privacyParts.links, fields: <PrivacyEditor data={content.data} /> };
  }
}
