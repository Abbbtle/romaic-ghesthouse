import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminRoutes } from "@/components/admin/admin-routes";
import { contentPageHref, editableSections } from "@/components/admin/content/content-sections";
import { editableContent } from "@/components/admin/content/editable-content";
import { SectionEditor } from "@/components/admin/content/section-editor";
import { SectionHistory } from "@/components/admin/content/section-history";
import { PageHeader } from "@/components/admin/page-header";
import { FlashToast } from "@/components/admin/toast";
import { whenLabel } from "@/components/admin/when-label";
import { ButtonAnchor } from "@/components/ui/button";
import { isSectionKey, sectionDescriptions, sectionNames, sectionPermissions } from "@/lib/content/schema";
import { requireDashboardActor } from "@/server/admin-session";
import { businessTimeZone, contentService } from "@/server/content";
import { clock } from "@/server/infrastructure";
import { saveContentSection, uploadContentImage } from "../actions";

export async function generateMetadata({ params }: PageProps<"/admin/content/[section]">): Promise<Metadata> {
  const { section } = await params;
  return { title: isSectionKey(section) ? sectionNames[section] : "Content" };
}

/** One section's editor, with the section nav beside it and its history below. */
export default async function ContentSectionPage({ params, searchParams }: PageProps<"/admin/content/[section]">) {
  const { section } = await params;
  if (!isSectionKey(section)) notFound();
  const actor = await requireDashboardActor({ permission: sectionPermissions[section] });

  const content = contentService();
  const [editable, revisions, query] = await Promise.all([content.getEditable(actor, section), content.listRevisions(actor, section), searchParams]);
  const now = clock.now();
  const saved = editable.savedAt ? `Last saved ${whenLabel(editable.savedAt, now, businessTimeZone)}.` : "Not changed yet: this is what your site started with.";
  const restored = typeof query.restored === "string" && /^\d+$/.test(query.restored) ? query.restored : null;

  return (
    <>
      {restored && <FlashToast message={`Version ${restored} is live again.`} tone="neutral" />}
      <PageHeader
        title={sectionNames[section]}
        description={
          <>
            {sectionDescriptions[section]}
            <span className="mt-1 block text-sm text-fg-3">{saved}</span>
          </>
        }
        back={{ href: adminRoutes.content, label: "Content" }}
        actions={
          contentPageHref(section) ? (
            <ButtonAnchor href={contentPageHref(section)!} external variant="secondary" size="sm">
              View on site
            </ButtonAnchor>
          ) : undefined
        }
      />
      <SectionEditor
        content={editableContent(section, editable.data)}
        revision={editable.revision}
        recovered={editable.recovered}
        save={saveContentSection}
        upload={uploadContentImage}
        available={editableSections(actor)}
        history={
          <SectionHistory
            section={section}
            revisions={revisions}
            currentRevision={editable.revision}
            viewerId={actor.id}
            now={now}
            timeZone={businessTimeZone}
          />
        }
      />
    </>
  );
}
