import { can } from "@/lib/accounts/access";
import { sitePagePaths } from "@/lib/content/pages";
import { sectionPages, sectionPermissions, type SectionKey } from "@/lib/content/schema";
import type { Actor } from "@/lib/kernel/actor";
import { adminRoutes } from "../admin-routes";

/**
 * How the dashboard groups the site's content: the business's own details
 * first, then each page in the order the site's menu has them, then what's
 * about the website as a whole.
 */
export const contentGroups: readonly { title: string; sections: readonly SectionKey[] }[] = [
  { title: "Your business", sections: ["site", "contact", "bookingTerms", "messages"] },
  { title: "Pages", sections: ["home", "apartments", "gallery", "facilities", "location", "policies", "contactPage", "book"] },
  { title: "Your website", sections: ["seo", "privacy"] },
];

/** The groups as someone sees them: only the sections they may edit, and no empty groups. */
export function visibleContentGroups(available: readonly SectionKey[]): { title: string; sections: SectionKey[] }[] {
  return contentGroups
    .map((group) => ({ title: group.title, sections: group.sections.filter((key) => available.includes(key)) }))
    .filter((group) => group.sections.length > 0);
}

/** The sections `actor` may edit, in the dashboard's order. */
export function editableSections(actor: Pick<Actor, "role">): SectionKey[] {
  return contentGroups.flatMap((group) => group.sections).filter((key) => can(actor, sectionPermissions[key]));
}

/** A section's editor. */
export function contentEditorHref(section: SectionKey, part?: string): string {
  return `${adminRoutes.content}/${section}${part ? `#${part}` : ""}`;
}

/** An earlier version of a section, from its history. */
export function contentRevisionHref(section: SectionKey, revision: number): string {
  return `${adminRoutes.content}/${section}/history/${revision}`;
}

/** The public page a section feeds, for "View on site"; null for a section the site doesn't show (the guest messages). */
export function contentPageHref(section: SectionKey): string | null {
  const page = sectionPages[section];
  return page ? sitePagePaths[page] : null;
}
