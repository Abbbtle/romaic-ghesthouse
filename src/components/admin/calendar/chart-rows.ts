import { addDays, compareIsoDates, daysBetween, type IsoDate } from "@/lib/format/zoned-time";
import type { AvailabilityBlock } from "@/lib/inventory/units";

/** One cell of a unit's row on the chart: a free night, or a block across one or more nights. */
export type ChartCell = { kind: "free"; night: IsoDate } | { kind: "block"; block: AvailabilityBlock; first: IsoDate; nights: number; startsBefore: boolean; endsAfter: boolean };

/** The nights from `from` up to (not including) `until`. */
export function chartNights(from: IsoDate, until: IsoDate): IsoDate[] {
  return Array.from({ length: Math.max(0, daysBetween(from, until)) }, (_, index) => addDays(from, index));
}

/**
 * A unit's row, night by night: each block becomes one cell spanning its
 * nights (clipped to the chart), every other night a free cell. A unit's
 * blocks never overlap (the database's exclusion constraint), so the row is
 * exact; should two ever arrive overlapping, the later one is skipped rather
 * than drawn over the first.
 */
export function chartRow(unitId: string, blocks: readonly AvailabilityBlock[], from: IsoDate, until: IsoDate): ChartCell[] {
  const own = blocks
    .filter((block) => block.unitId === unitId && compareIsoDates(block.stay.leave, from) > 0 && compareIsoDates(block.stay.arrive, until) < 0)
    .sort((a, b) => compareIsoDates(a.stay.arrive, b.stay.arrive));
  const cells: ChartCell[] = [];
  let night = from;
  for (const block of own) {
    const first = compareIsoDates(block.stay.arrive, from) < 0 ? from : block.stay.arrive;
    if (compareIsoDates(first, night) < 0) continue;
    while (compareIsoDates(night, first) < 0) {
      cells.push({ kind: "free", night });
      night = addDays(night, 1);
    }
    const end = compareIsoDates(block.stay.leave, until) > 0 ? until : block.stay.leave;
    cells.push({ kind: "block", block, first, nights: daysBetween(first, end), startsBefore: compareIsoDates(block.stay.arrive, from) < 0, endsAfter: compareIsoDates(block.stay.leave, until) > 0 });
    night = end;
  }
  while (compareIsoDates(night, until) < 0) {
    cells.push({ kind: "free", night });
    night = addDays(night, 1);
  }
  return cells;
}
