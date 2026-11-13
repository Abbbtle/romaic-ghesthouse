import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { contentEditorHref } from "@/components/admin/content/content-sections";
import { RestoreRevisionButton } from "@/components/admin/content/restore-revision-button";
import { RevisionView } from "@/components/admin/content/revision-view";
import { savedByLabel } from "@/components/admin/content/section-history";
import { PageHeader } from "@/components/admin/page-header";
import { capitalised, whenLabel } from "@/components/admin/when-label";
import { Notice } from "@/components/ui/notice";
import { isSectionKey, sectionNames, sectionPermissions } from "@/lib/content/schema";
import { requireDashboardActor } from "@/server/admin-session";
import { businessTimeZone, contentService } from "@/server/content";
import { clock } from "@/server/infrastructure";
import { restoreContentRevision } from "../../../actions";

export async function generateMetadata({ params }: PageProps<"/admin/content/[section]/history/[revision]">): Promise<Metadata> {
  const { section, revision } = await params;
  return { title: isSectionKey(section) ? `${sectionNames[section]}, version ${revision}` : "Content" };
}

/** An earlier version of a section, read-only, with a way to put it back. */
export default async function ContentRevisionPage({ params }: PageProps<"/admin/content/[section]/history/[revision]">) {
  const { section, revision: revisionParam } = await params;
  if (!isSectionKey(section) || !/^\d{1,9}$/.test(revisionParam)) notFound();
  const actor = await requireDashboardActor({ permission: sectionPermissions[section] });

  const content = contentService();
  const [view, editable] = await Promise.all([content.getRevision(actor, section, Number(revisionParam)), content.getEditable(actor, section)]);
  if (!view) notFound();

  const when = view.savedAt ? capitalised(whenLabel(view.savedAt, clock.now(), businessTimeZone)) : null;
  const byLine = [savedByLabel(view, actor.id), when].filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader
        title={`${sectionNames[section]}: version ${view.revision}`}
        description={byLine}
        back={{ href: contentEditorHref(section), label: sectionNames[section] }}
        actions={
          view.current || !view.data ? undefined : (
            <RestoreRevisionButton
              section={section}
              sectionName={sectionNames[section]}
              revision={view.revision}
              currentRevision={editable.revision}
              restore={restoreContentRevision}
            />
          )
        }
      />
      <div className="grid max-w-form gap-6">
        {view.current && (
          <Notice tone="info" live="off">
            This is the version your site shows now.
          </Notice>
        )}
        {view.data ? (
          <RevisionView section={section} data={view.data} />
        ) : (
          <Notice tone="warning" live="off" title="This version can't be shown">
            It was saved in a form this site no longer reads, so it can&apos;t be put back.
          </Notice>
        )}
      </div>
    </>
  );
}
