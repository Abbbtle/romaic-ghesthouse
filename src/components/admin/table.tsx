import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

type TableFrameProps = {
  /** What the table lists, for screen readers: "Testimonials, in site order". */
  caption: string;
  /** Below this width the table scrolls sideways inside its frame, never the page. */
  minWidth?: string;
  className?: string;
  children: ReactNode;
};

/**
 * A table in a level-1 frame with hairline rows (design-spec §6.8, §10.6).
 * Empty states go inside it, in an EmptyRow, so the frame stays.
 */
export function TableFrame({ caption, minWidth = "36rem", className, children }: TableFrameProps) {
  return (
    // Positioned, so screen-reader-only content inside is clipped by the frame instead of widening the page.
    <div className={cx("relative overflow-x-auto rounded-md border border-hairline bg-white", className)}>
      <table className="w-full border-collapse text-left text-base" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

type CellProps = { children?: ReactNode; align?: "left" | "right"; className?: string };

/** A column heading: small, medium weight, on the faint header tint. */
export function HeaderCell({ children, align = "left", className }: CellProps) {
  return (
    <th
      scope="col"
      className={cx("border-b border-hairline bg-neutral-25 px-4 py-2.5 text-sm font-medium whitespace-nowrap text-fg-2", align === "right" && "text-right", className)}
    >
      {children}
    </th>
  );
}

/** A table cell. Right-aligned cells hold numbers, so they use tabular figures. */
export function Cell({ children, align = "left", className }: CellProps) {
  return (
    <td className={cx("border-b border-hairline px-4 py-3 align-top [tr:last-child_&]:border-b-0", align === "right" && "text-right tabular-nums", className)}>
      {children}
    </td>
  );
}

/** The main cell of a row that opens a record: link-coloured, with a chevron, and an optional detail line. */
export function RowLink({ href, children, detail }: { href: string; children: ReactNode; detail?: ReactNode }) {
  return (
    <Link href={href} className="group inline-flex flex-col">
      <span className="inline-flex items-center gap-1.5 font-medium text-link underline-offset-4 group-hover:underline">
        {children}
        <ChevronRight aria-hidden="true" strokeWidth={2} className="size-4 text-fg-3" />
      </span>
      {detail && <span className="mt-0.5 text-sm text-fg-3">{detail}</span>}
    </Link>
  );
}

/** What an empty table says, inside the table so its frame and headings stay. */
export function EmptyRow({ columns, title, children }: { columns: number; title: string; children?: ReactNode }) {
  return (
    <tr>
      <td colSpan={columns} className="px-4 py-12">
        <p className="font-medium text-fg">{title}</p>
        {children && <div className="mt-1 max-w-[48ch] text-sm text-fg-2">{children}</div>}
      </td>
    </tr>
  );
}
