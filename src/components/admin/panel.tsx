import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

type PanelProps = {
  /** The panel's heading: "Today's sessions". */
  title?: string;
  /** For the heading's level in the page's outline. */
  headingLevel?: 2 | 3;
  description?: ReactNode;
  /** A link or button opposite the title: "Open diary". */
  actions?: ReactNode;
  /** Lets lists run edge to edge, their rows bringing their own padding. */
  flush?: boolean;
  className?: string;
  children: ReactNode;
};

/** A white level-1 panel for one group of content on a dashboard page, with an optional title row. */
export function Panel({ title, headingLevel = 2, description, actions, flush = false, className, children }: PanelProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section className={cx("min-w-0 overflow-hidden rounded-md border border-hairline bg-white", className)}>
      {(title || actions) && (
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-hairline px-4 py-3 lg:px-5">
          <div className="min-w-0">
            {title && <Heading className="text-base font-bold text-ink">{title}</Heading>}
            {description && <p className="mt-0.5 text-sm text-fg-2">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
        </div>
      )}
      <div className={flush ? undefined : "p-4 lg:p-5"}>{children}</div>
    </section>
  );
}
