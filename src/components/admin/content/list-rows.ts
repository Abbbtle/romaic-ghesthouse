/**
 * The rows of a list editor: each item with a key React keeps it by (so a
 * row's fields move with it when it's moved) and whether it was added since
 * the last save. Pure, so the list editor's moves are easy to test.
 */
export type Row<Item> = { key: string; item: Item; added: boolean };

/** The rows for a list as saved. */
export function rowsOf<Item>(items: readonly Item[]): Row<Item>[] {
  return items.map((item, index) => ({ key: `saved-${index}`, item, added: false }));
}

/** The rows with the one at `index` swapped with its neighbour `by` away; unchanged when there's no neighbour there. */
export function moveRow<Item>(rows: readonly Row<Item>[], index: number, by: -1 | 1): Row<Item>[] {
  const target = index + by;
  const moving = rows[index];
  const neighbour = rows[target];
  if (!moving || !neighbour) return [...rows];
  const moved = [...rows];
  moved[target] = moving;
  moved[index] = neighbour;
  return moved;
}

export function removeRow<Item>(rows: readonly Row<Item>[], index: number): Row<Item>[] {
  return rows.filter((_, position) => position !== index);
}

export function addRow<Item>(rows: readonly Row<Item>[], item: Item, key: string): Row<Item>[] {
  return [...rows, { key, item, added: true }];
}

/** What a row is called in buttons and announcements: "focus area 2". */
export function rowName(noun: string, index: number): string {
  return `${noun} ${index + 1}`;
}

/** The same with a capital, for a row's heading: "Focus area 2". */
export function rowHeading(noun: string, index: number): string {
  const name = rowName(noun, index);
  return name.charAt(0).toUpperCase() + name.slice(1);
}
