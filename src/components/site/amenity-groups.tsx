import { cx } from "@/components/ui/cx";
import { AmenityIconGlyph } from "./amenity-icon";
import { amenityGroups, type AmenityGroup } from "./romaic-facts";

/**
 * The amenities in the brand guide's four groups (Comfort, Connectivity,
 * Security, Convenience), each item with its gold line icon. The groups sit
 * in a list of lists, not cards: a gold rule above each group name carries
 * the structure.
 */
export function AmenityGroups({ groups = amenityGroups, className }: { groups?: readonly AmenityGroup[]; className?: string }) {
  return (
    <div className={cx("grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {groups.map((group) => (
        <section key={group.title} aria-labelledby={`amenities-${group.title.toLowerCase()}`} className="grid content-start gap-4">
          <div className="grid gap-3">
            <hr className="gold-rule w-12" />
            <h3 id={`amenities-${group.title.toLowerCase()}`} className="font-display text-base font-semibold tracking-[0.16em] text-ink uppercase">
              {group.title}
            </h3>
          </div>
          <ul className="grid gap-3">
            {group.items.map((item) => (
              <li key={item.label} className="flex items-start gap-3 text-base leading-snug">
                <AmenityIconGlyph icon={item.icon} className="mt-px size-5 shrink-0 text-gold-text" />
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
