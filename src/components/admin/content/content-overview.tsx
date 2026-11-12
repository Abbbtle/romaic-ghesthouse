import { ChevronRight, Lock, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { sectionDescriptions, sectionNames, type SectionKey } from "@/lib/content/schema";
import { StatusPill } from "../status-pill";
import { whenLabel } from "../when-label";
import { contentEditorHref, visibleContentGroups } from "./content-sections";

/** What the content page says about a section: when it was last saved, and whether its saved version can't be read. */
export type SectionOverview = { key: SectionKey; savedAt: Date | null; recovered: boolean };

type ContentOverviewProps = {
  /** The sections this person may edit, as the content service lists them. */
  sections: readonly SectionOverview[];
  /** The time now, and the business's time zone, for "Saved today at 14:02". */
  now: Date;
  timeZone: string;
};

/** Sections only the owner may change, marked so an owner knows why an admin can't help with them. */
const ownerOnlySections: readonly SectionKey[] = ["contact"];

const cardClasses =
  "group flex h-full items-start gap-3 rounded-md border border-hairline bg-white p-4 transition-colors duration-150 hover:border-neutral-300 hover:bg-neutral-25 lg:p-5";

/**
 * The content page: a card per section this person may edit, grouped as
 * the business's details and the website's, each saying when it was last
 * saved. Sections someone's role doesn't cover never appear.
 */
export function ContentOverview({ sections, now, timeZone }: ContentOverviewProps) {
  const byKey = new Map(sections.map((section) => [section.key, section]));
  const groups = visibleContentGroups(sections.map((section) => section.key));
  return (
    <div className="grid max-w-admin gap-10">
      {groups.map((group, index) => (
        <section key={group.title} aria-labelledby={`content-group-${index}`}>
          <h2 id={`content-group-${index}`} className="text-h4 font-bold text-ink">
            {group.title}
          </h2>
          <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {group.sections.map((key) => {
              const overview = byKey.get(key);
              return (
                <li key={key}>
                  <Link href={contentEditorHref(key)} className={cardClasses}>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-ink">{sectionNames[key]}</span>
                      <span className="mt-1 block text-sm text-fg-2">{sectionDescriptions[key]}</span>
                      <span className="mt-3 flex flex-wrap items-center gap-2 text-xs text-fg-3">
                        {overview?.savedAt ? `Saved ${whenLabel(overview.savedAt, now, timeZone)}` : "Not changed yet"}
                        {ownerOnlySections.includes(key) && (
                          <StatusPill tone="neutral" icon={<Lock aria-hidden="true" />}>
                            Owner only
                          </StatusPill>
                        )}
                        {overview?.recovered && (
                          <StatusPill tone="warning" icon={<TriangleAlert aria-hidden="true" />}>
                            Needs a look
                          </StatusPill>
                        )}
                      </span>
                    </span>
                    <ChevronRight aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-fg-3" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
