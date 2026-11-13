import Link from "next/link";
import { TabsScroller } from "./tabs-scroller";

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
 * their place in history and work before scripts load. A bar wider than
 * the screen scrolls sideways in its own frame, with the current tab
 * brought into view and a fade at the edge that has more.
 */
export function Tabs({ label, items, current, className }: TabsProps) {
  return (
    <TabsScroller label={label} current={current} className={className}>
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
    </TabsScroller>
  );
}
