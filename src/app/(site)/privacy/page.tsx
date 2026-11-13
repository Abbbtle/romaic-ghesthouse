import type { Metadata } from "next";
import { PageBand } from "@/components/site/page-heading";
import { siteText } from "@/components/site/site-type";
import { NotYetKnown } from "@/components/site/to-confirm";
import { Prose } from "@/components/ui/prose";
import { formatPhoneNumber, telHref } from "@/lib/format/phone";
import { siteFacts } from "@/lib/content/derive";
import { parseMarkdown, type MarkdownBlock, type MarkdownInline } from "@/lib/content/markdown";
import { formatDayLong } from "@/lib/format/date-time";
import type { PublicInformationOfficer } from "@/lib/privacy/privacy";
import { publicInformationOfficer } from "@/server/privacy";
import { getSiteContent } from "@/server/site-content";
import { pageMetadata } from "../page-metadata";

/** Read per request with the content as it is now, like every public page (see ../layout.tsx), so it may wait for it. */
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("privacy");
}

const text = (value: string): MarkdownInline => ({ type: "text", text: value });

function plainText(nodes: readonly MarkdownInline[]): string {
  return nodes.map((node) => (node.type === "text" ? node.text : node.type === "break" ? " " : plainText(node.children))).join("");
}

/** The notice's own words that stood in for the details before the owner kept them in the dashboard. */
const standIn = /^(To be completed by the owner|The Information Officer answers for how we handle personal information)/;

/**
 * The notice with the Information Officer's details in its own "Information
 * Officer" section, in the notice's own style (the owner keeps them in the
 * dashboard: admin can edit the notice's text, not who answers for guests'
 * information). Without that heading, the section goes at the end. `before`
 * runs to where the details belong; with no officer recorded, a marked gap
 * goes between `before` and `after`.
 */
function withOfficer(blocks: readonly MarkdownBlock[], officer: PublicInformationOfficer | null): { before: MarkdownBlock[]; after: MarkdownBlock[] } {
  const headingAt = blocks.findIndex((block) => block.type === "heading" && /^information officer$/i.test(plainText(block.children).trim()));
  const heading: MarkdownBlock[] = headingAt === -1 ? [{ type: "heading", level: 2, children: [text("Information Officer")] }] : [];
  const upTo = headingAt === -1 ? blocks.length : headingAt + 1;
  const rest = blocks.slice(upTo).filter((block, index) => !(index === 0 && block.type === "paragraph" && standIn.test(plainText(block.children).trim())));
  const lead: MarkdownBlock = { type: "paragraph", children: [text("The Information Officer answers for how we handle personal information.")] };
  const details: MarkdownBlock[] = [lead];
  if (officer) {
    const contact: MarkdownInline[] = [{ type: "strong", children: [text(officer.name)] }];
    const line = (node: MarkdownInline) => contact.push({ type: "break" }, node);
    if (officer.email) line({ type: "link", href: `mailto:${officer.email}`, children: [text(officer.email)] });
    if (officer.phone) line({ type: "link", href: telHref(officer.phone), children: [text(formatPhoneNumber(officer.phone))] });
    if (officer.registrationReference) line(text(`Registered with the Information Regulator: ${officer.registrationReference}`));
    details.push({ type: "paragraph", children: contact });
  }
  const before = [...blocks.slice(0, upTo), ...heading, ...details];
  return headingAt === -1 ? { before, after: [] } : { before, after: rest };
}

/**
 * The privacy notice POPIA requires, as the owner keeps it in the
 * dashboard: limited Markdown with the business's details filled in, and
 * the version and date each booking request records it was sent under.
 */
export default async function PrivacyPage() {
  const [{ privacy, site, contact }, officer] = await Promise.all([getSiteContent(), publicInformationOfficer()]);
  const blocks = parseMarkdown(privacy.body, siteFacts(site, contact));
  const officerSection = withOfficer(blocks, officer);
  return (
    <main id="main" className="flex-1">
      <PageBand spacing="head">
        <div className="grid justify-items-start gap-5">
          <h1 className={siteText.page}>{privacy.heading}</h1>
          <p className={siteText.secondary}>
            Version {privacy.version}, updated {formatDayLong(privacy.updatedOn)}
          </p>
        </div>
      </PageBand>
      <PageBand>
        {officerSection.before.length > 0 && <Prose blocks={officerSection.before} size="page" className="max-w-prose" />}
        {/* A gap, marked, until the owner records who the Information Officer is (Privacy, in the dashboard). Their details, once given, are part of the text above. */}
        {officer === null && <NotYetKnown className="my-4 max-w-prose">The Information Officer&apos;s name and contact details are still to be given by the owner.</NotYetKnown>}
        {officerSection.after.length > 0 && <Prose blocks={officerSection.after} size="page" className="max-w-prose" />}
      </PageBand>
    </main>
  );
}
