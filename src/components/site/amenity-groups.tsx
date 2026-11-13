import { cx } from "@/components/ui/cx";
import { AmenityIconGlyph } from "./amenity-icon";
import { amenityGroups, type AmenityGroup } from "./romaic-facts";
import { ToConfirm } from "./to-confirm";

/**
 * Amenities in groups (the brand guide's Comfort, Connectivity, Security,
 * Convenience, plus any the site's content adds), each item with its gold
 * line icon, a short note where there is one ("At an extra charge"), and a
 * "To confirm" mark on anything the owner hasn't confirmed. The groups sit
 * in a list of lists, not cards: a gold rule above each group name carries
 * the structure.
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
    <div className={cx("grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {groups.map((group, index) => {
        const id = `amenities-${index}`;
        // A long group takes the whole row and lists its items in columns, so it never towers over the others.
        const wide = group.items.length > 6;
        // One tag by the heading when nothing in the group is confirmed; one per item only in a mixed group.
        const allUnconfirmed = group.items.every((item) => item.confirmed === false);
        return (
          <section key={`${group.title}-${index}`} aria-labelledby={id} className={cx("grid content-start gap-4", wide && "sm:col-span-full")}>
            <div className="grid gap-3">
              <hr className="gold-rule w-12" />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Heading id={id} className="font-display text-base font-semibold tracking-[0.16em] text-ink uppercase">
                  {group.title}
                </Heading>
                {allUnconfirmed && <ToConfirm />}
              </div>
            </div>
            <ul className={cx("grid gap-3", wide && "gap-x-10 sm:grid-cols-2 lg:grid-cols-3")}>
              {group.items.map((item) => (
                <li key={item.label} className="flex items-start gap-3 text-base leading-normal">
                  <AmenityIconGlyph icon={item.icon} className="mt-px size-5 shrink-0 text-gold-text" />
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
