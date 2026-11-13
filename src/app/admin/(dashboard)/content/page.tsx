import type { Metadata } from "next";
import { ContentOverview } from "@/components/admin/content/content-overview";
import { PageHeader } from "@/components/admin/page-header";
import { requireDashboardActor } from "@/server/admin-session";
import { businessTimeZone, contentService } from "@/server/content";
import { clock } from "@/server/infrastructure";

export const metadata: Metadata = { title: "Content" };

/**
 * Everything on the website this person may change, section by section.
 * Entering needs `content:edit` (owner and admin); the list then shows only
 * the sections their role covers, so an admin never sees the contact details.
 */
export default async function ContentPage() {
  const actor = await requireDashboardActor({ permission: "content:edit" });
  const sections = await contentService().getSummaries(actor);
  return (
    <>
      <PageHeader title="Content" description="Everything on your website. Changes go live as soon as you save them." />
      <ContentOverview sections={sections} now={clock.now()} timeZone={businessTimeZone} />
    </>
  );
}
