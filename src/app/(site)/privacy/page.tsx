import type { Metadata } from "next";
import { PageBand } from "@/components/site/page-heading";
import { GoldBarHeading } from "@/components/site/gold-bar-heading";
import { Prose } from "@/components/ui/prose";
import { siteFacts } from "@/lib/content/derive";
import { parseMarkdown } from "@/lib/content/markdown";
import { formatDayLong } from "@/lib/format/date-time";
import { getSiteContent } from "@/server/site-content";
import { pageMetadata } from "../page-metadata";

/** Read per request with the content as it is now, like every public page (see ../layout.tsx), so it may wait for it. */
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("privacy");
}

/**
 * The privacy notice POPIA requires, as the owner keeps it in the
 * dashboard: limited Markdown with the business's details filled in, and
 * the version and date each booking request records it was sent under.
 */
export default async function PrivacyPage() {
  const { privacy, site, contact } = await getSiteContent();
  const blocks = parseMarkdown(privacy.body, siteFacts(site, contact));
  return (
    <main id="main" className="flex-1">
      <PageBand tone="cream">
        <div className="grid justify-items-start gap-4">
          <GoldBarHeading as="h1" size="hero">
            {privacy.heading}
          </GoldBarHeading>
          <p className="text-sm text-fg-2">
            Version {privacy.version}, updated {formatDayLong(privacy.updatedOn)}
          </p>
        </div>
      </PageBand>
      <PageBand>
        <Prose blocks={blocks} size="page" className="max-w-prose" />
      </PageBand>
    </main>
  );
}
