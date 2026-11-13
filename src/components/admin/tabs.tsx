import Link from "next/link";
import { cx } from "@/components/ui/cx";

export type TabLink = {
  href: string;
  label: string;
  /** Shown after the label: "Waiting (2)". */
  count?: number;
};

type TabsProps = {
  /** Names the set for screen readers: "Requests". */
  label: string;
  items: readonly TabLink[];
  /** The href of the tab being shown. */
  current: string;
  className?: string;
};

/**
 * Views of one list, such as Waiting · Accepted · Declined, as a segmented
 * bar (design-spec §11.1). Each view has its own address (?tab=…), so these
 * are links marked aria-current rather than ARIA tabs: they navigate, keep
 * their place in history and work before scripts load.
 */
export function Tabs({ label, items, current, className }: TabsProps) {
  return (
    <nav aria-label={label} className={cx("max-w-full overflow-x-auto", className)}>
      <ul className="inline-flex gap-1 rounded-sm border border-hairline bg-neutral-100 p-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              scroll={false}
              aria-current={item.href === current ? "page" : undefined}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xs px-3 text-sm font-medium whitespace-nowrap text-fg-2 transition-colors duration-150 hover:text-fg aria-[current=page]:bg-white aria-[current=page]:text-fg aria-[current=page]:shadow-1 pointer-fine:min-h-9"
            >
              {item.label}
              {item.count !== undefined && <span className="text-fg-3 tabular-nums">({item.count})</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
