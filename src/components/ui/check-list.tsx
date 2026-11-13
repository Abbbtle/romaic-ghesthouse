import { Check } from "lucide-react";
import { cx } from "./cx";

type CheckListProps = {
  items: readonly string[];
  /** Two columns from 640 px, for longer lists such as "What's included". */
  columns?: 1 | 2;
  /** Light checks for navy surfaces. */
  onDark?: boolean;
  className?: string;
};

/** Features and inclusions, each with a 16 px check (design-spec §6.7–6.8). */
export function CheckList({ items, columns = 1, onDark = false, className }: CheckListProps) {
  return (
    <ul className={cx("grid gap-2.5 text-base", columns === 2 && "sm:grid-cols-2 sm:gap-x-8", className)}>
      {items.map((item, index) => (
        // A static list in content order, so its position is a stable key (content may repeat an item).
        <li key={index} className="flex gap-2.5">
          <Check aria-hidden="true" strokeWidth={2} className={cx("mt-1 size-4 shrink-0", onDark ? "text-romaic-gold" : "text-gold-text")} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
