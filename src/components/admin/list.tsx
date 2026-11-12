import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

/** Rows separated by hairlines, edge to edge in a flush Panel. */
export function List({ label, className, children }: { label?: string; className?: string; children: ReactNode }) {
  return (
    <ul aria-label={label} className={cx("divide-y divide-hairline", className)}>
      {children}
    </ul>
  );
}

type ListRowProps = {
  /** A narrow first column, such as the time: "05:00". Set in tabular figures. */
  lead?: ReactNode;
  /** The row's main content. */
  children: ReactNode;
  /** Something at the end, such as the session type or a status. */
  trailing?: ReactNode;
  /** Makes the whole row a link, with a chevron. */
  href?: string;
  className?: string;
};

const rowLayout = "flex min-h-12 items-center gap-3 px-4 py-3 text-base lg:px-5";

/**
 * One row of a list: "05:00 · Charles Y · 1:1". As a link the whole row is the
 * target (at least 48 px tall), its focus ring drawn inside so neighbours and
 * the panel's edge never cut it off.
 */
export function ListRow({ lead, children, trailing, href, className }: ListRowProps) {
  const content = (
    <>
      {lead && <span className="w-13 shrink-0 font-medium tabular-nums">{lead}</span>}
      <span className="min-w-0 flex-1">{children}</span>
      {trailing && <span className="shrink-0 text-sm text-fg-3">{trailing}</span>}
      {href && <ChevronRight aria-hidden="true" strokeWidth={2} className="size-4 shrink-0 text-fg-3" />}
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className={cx(rowLayout, "transition-colors duration-150 -outline-offset-2 hover:bg-chalk", className)}>
          {content}
        </Link>
      ) : (
        <div className={cx(rowLayout, className)}>{content}</div>
      )}
    </li>
  );
}
