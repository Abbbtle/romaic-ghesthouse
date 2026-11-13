import { cx } from "@/components/ui/cx";
import { AmenityIconGlyph } from "./amenity-icon";
import { amenityGroups, type AmenityGroup } from "./romaic-facts";
import { ToConfirm } from "./to-confirm";

/**
 * Amenities in groups (the brand guide's Comfort, Connectivity, Security,
 * Convenience, plus any the site's content adds), each item with its gold
 * line icon, a short note where there is one ("At an extra charge"), and a
 * "To confirm" mark on anything the owner hasn't confirmed. The groups sit
 * in a list of lists, not cards: a 2 px gold rule above each group's name
 * carries the structure, as the approved design heads its info blocks.
 */
export function AmenityGroups({
  groups = amenityGroups,
  headingLevel = 3,
  className,
}: {
  groups?: readonly AmenityGroup[];
  headingLevel?: 2 | 3;
  className?: string;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className={cx("grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {groups.map((group, index) => {
        const id = `amenities-${index}`;
        // A long group takes the whole row and lists its items in columns, so it never towers over the others.
        const wide = group.items.length > 6;
        // One tag by the heading when nothing in the group is confirmed; one per item only in a mixed group.
        const allUnconfirmed = group.items.every((item) => item.confirmed === false);
        return (
          <section key={`${group.title}-${index}`} aria-labelledby={id} className={cx("grid content-start gap-5 border-t-2 border-romaic-gold pt-5", wide && "sm:col-span-full")}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <Heading id={id} className="font-display text-title font-normal text-ink">
                {group.title}
              </Heading>
              {allUnconfirmed && <ToConfirm />}
            </div>
            <ul className={cx("grid gap-3", wide && "gap-x-10 sm:grid-cols-2 lg:grid-cols-3")}>
              {group.items.map((item) => (
                <li key={item.label} className="flex items-start gap-3 leading-normal">
                  <AmenityIconGlyph icon={item.icon} className="mt-0.5 size-5 shrink-0 text-gold-text" />
                  <span className="grid gap-1">
                    <span>
                      {item.label}
                      {item.note && <span className="text-fg-3"> · {item.note}</span>}
                    </span>
                    {item.confirmed === false && !allUnconfirmed && <ToConfirm className="justify-self-start" />}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
