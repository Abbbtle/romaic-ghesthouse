"use client";

import Link from "next/link";
import { useId, type ChangeEvent } from "react";
import { cx } from "@/components/ui/cx";
import { selectClasses } from "@/components/ui/form-controls";
import { preferredScrollBehavior } from "@/components/ui/motion";
import { sectionNames, type SectionKey } from "@/lib/content/schema";
import { contentEditorHref, visibleContentGroups } from "./content-sections";
import type { EditorPartLink } from "./editor-part";

type ContentNavProps = {
  current: SectionKey;
  /** The sections this person may edit: the only ones listed. */
  available: readonly SectionKey[];
  /** The current section's parts, to jump to. */
  parts: readonly EditorPartLink[];
};

/**
 * Finding your way around the content. From 1024 px: a sticky column
 * listing the sections this person may edit, grouped, with the open one's parts
 * under it. On phones: a "Jump to" select for the open section's parts
 * (the back link in the title bar leads to the other sections).
 */
export function ContentNav({ current, available, parts }: ContentNavProps) {
  const groups = visibleContentGroups(available);
  return (
    <>
      <nav aria-label="Content" className="sticky top-8 -mx-1 hidden max-h-[calc(100svh-4rem)] self-start overflow-y-auto px-1 pt-1 pb-4 lg:block">
        <div className="grid gap-6">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="px-3 text-xs font-medium text-fg-3">{group.title}</p>
              <ul className="mt-1.5 grid gap-0.5">
                {group.sections.map((section) => (
                  <li key={section}>
                    <Link
                      href={contentEditorHref(section)}
                      aria-current={section === current ? "page" : undefined}
                      className="flex min-h-10 items-center rounded-sm px-3 text-sm font-medium text-fg-2 transition-colors duration-150 hover:bg-white hover:text-fg aria-[current=page]:bg-white aria-[current=page]:text-primary aria-[current=page]:shadow-1"
                    >
                      {sectionNames[section]}
                    </Link>
                    {section === current && parts.length > 1 && (
                      <ul className="mt-0.5 mb-1 ml-3 grid gap-0.5 border-l border-hairline pl-2">
                        {parts.map((part) => (
                          <li key={part.id}>
                            <a
                              href={`#${part.id}`}
                              className="flex min-h-9 items-center rounded-sm px-2 text-sm text-fg-2 transition-colors duration-150 hover:bg-white hover:text-fg"
                            >
                              {part.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>
      {parts.length > 2 && <PartJump parts={parts} />}
    </>
  );
}

/** On phones: a select that scrolls to a part of the form and moves focus to its heading. */
function PartJump({ parts }: { parts: readonly EditorPartLink[] }) {
  const id = useId();
  const jump = (event: ChangeEvent<HTMLSelectElement>) => {
    const heading = document.getElementById(`${event.currentTarget.value}-title`);
    if (!heading) return;
    heading.focus({ preventScroll: true });
    heading.closest("section")?.scrollIntoView({ block: "start", behavior: preferredScrollBehavior() });
  };
  return (
    <div className="mb-5 lg:hidden">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        Jump to
      </label>
      <select id={id} defaultValue="" onChange={jump} className={cx(selectClasses("compact"), "mt-1.5")}>
        <option value="" disabled>
          Choose a part of this page
        </option>
        {parts.map((part) => (
          <option key={part.id} value={part.id}>
            {part.title}
          </option>
        ))}
      </select>
    </div>
  );
}
