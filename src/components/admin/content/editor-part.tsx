import type { ReactNode } from "react";

/** One part of a section's form, which the section nav links to: "Address", "Social links". */
export type EditorPartLink = { id: string; title: string };

type EditorPartProps = EditorPartLink & {
  /** One sentence on where this shows on the site. */
  description?: ReactNode;
  children: ReactNode;
};

/**
 * A part of a section's form under its own heading, separated from the one
 * before by a hairline. Its id is the anchor the section nav jumps to; the
 * scroll margin keeps the heading clear of the phone's sticky title bar.
 */
export function EditorPart({ id, title, description, children }: EditorPartProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="grid scroll-mt-20 gap-5 border-t border-hairline pt-8 first:border-t-0 first:pt-0 lg:scroll-mt-8">
      <div>
        <h2 id={`${id}-title`} tabIndex={-1} className="text-h4 font-bold text-ink focus:outline-none">
          {title}
        </h2>
        {description && <p className="mt-1 max-w-[60ch] text-sm text-fg-2">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** The parts of a form by key, in the order they appear, for the section nav and the form alike. */
export function partsOf<Key extends string>(titles: Record<Key, string>): { part: Record<Key, EditorPartLink>; links: EditorPartLink[] } {
  // Object.keys can't know its keys are exactly Key's; `titles` was typed with them.
  const keys = Object.keys(titles) as Key[];
  const part = {} as Record<Key, EditorPartLink>;
  for (const key of keys) part[key] = { id: key, title: titles[key] };
  return { part, links: keys.map((key) => part[key]) };
}
