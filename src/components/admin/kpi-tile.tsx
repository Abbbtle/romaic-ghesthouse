import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { cx } from "@/components/ui/cx";

type KpiTileProps = {
  /** The number: 6. */
  value: number | string;
  /** What it counts, read after the number: "Sessions today". */
  label: string;
  /** Where the tile leads: the list behind the number. */
  href?: string;
  className?: string;
};

const tileClasses = "relative flex min-h-24 flex-col justify-between gap-2 rounded-md border border-hairline bg-white p-3 lg:p-4";

/**
 * A headline number on the Today page (design-spec §10.2): the number large
 * and wide, the label under it, and a chevron when the tile links on. Three
 * sit in a row even at 375 px; labels wrap onto two lines.
 */
export function KpiTile({ value, label, href, className }: KpiTileProps) {
  const content = (
    <>
      <span className="text-h2 leading-none font-bold text-ink tabular-nums">{value}</span>
      <span className="text-sm leading-snug text-fg-2">{label}</span>
    </>
  );
  if (!href) return <p className={cx(tileClasses, className)}>{content}</p>;
  return (
    <Link href={href} className={cx(tileClasses, "pr-7 transition-colors duration-150 hover:border-neutral-300 hover:bg-neutral-25 lg:pr-9", className)}>
      {content}
      <ChevronRight aria-hidden="true" strokeWidth={2} className="absolute top-3 right-2 size-4 text-fg-3 lg:top-4 lg:right-3" />
    </Link>
  );
}
