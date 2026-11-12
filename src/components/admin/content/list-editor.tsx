"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { useFormField } from "@/components/ui/form";
import { errorClasses, hintClasses, labelClasses } from "@/components/ui/form-controls";
import { IconButton } from "@/components/ui/icon-button";
import { addRow, moveRow, removeRow, rowHeading, rowName, rowsOf, type Row } from "./list-rows";
import { useFormReset } from "./use-form-reset";

/** What one item and several are called, in lower case: { one: "focus area", many: "focus areas" }. */
export type ListNoun = { one: string; many: string };

export type ListRowProps<Item> = {
  item: Item;
  /** Where the row's fields go: "focusAreas.2". Name them under it ("plans.0.name"), or with it for a list of text. */
  path: string;
  index: number;
  /** Added since the last save. */
  added: boolean;
  /** The row's name for labels: "focus area 3". */
  name: string;
};

type ListEditorProps<Item> = {
  /** The list's path in the section: "focusAreas", "groups.0.plans". */
  name: string;
  noun: ListNoun;
  /** The list as saved. */
  items: readonly Item[];
  /** The fewest and most items (the content core's listLimits). */
  limits: { readonly min: number; readonly max: number };
  /** A new, empty item for "Add". */
  blank: () => Item;
  /** One row's fields. */
  children: (row: ListRowProps<Item>) => ReactNode;
  /**
   * line: each row is one field beside its buttons (a list of words or
   * lines). card: each row is a bordered card with a heading and its
   * buttons, for items with several fields.
   */
  variant?: "line" | "card";
  /** A card's heading; "Plan 2" by default. */
  rowTitle?: (row: ListRowProps<Item>) => string;
  /** The list's label, for line lists (a card list sits under its part's heading). */
  label?: string;
  hint?: ReactNode;
};

type FocusTarget = { rowKey: string; control: "up" | "down" | "remove" | "first-field" } | { control: "add" };

/**
 * A list someone can add to, remove from and reorder (design-spec §10.5):
 * Move up, Move down and Remove buttons on every row, never drag and drop,
 * so it all works from a keyboard; "Add" at the bottom. The order is part of
 * the form, saved with Save, and Discard puts the rows back as they were.
 * The list's bounds are kept: Add goes at the most, and Remove stops at the
 * fewest, saying why.
 */
export function ListEditor<Item>({ name, noun, items, limits, blank, children, variant = "line", rowTitle, label, hint }: ListEditorProps<Item>) {
  const wiring = useFormField(name);
  const [rows, setRows] = useState<Row<Item>[]>(() => rowsOf(items));
  const [announcement, setAnnouncement] = useState("");
  const added = useRef(0);
  const focusNext = useRef<FocusTarget | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const labelId = useId();

  useFormReset(box, () => {
    setRows(rowsOf(items));
    setAnnouncement("");
  });

  // After a change, focus stays with what was acted on: the moved row's button, the next row, or the new row.
  useEffect(() => {
    const target = focusNext.current;
    focusNext.current = null;
    if (target && box.current) focusControl(box.current, target);
  }, [rows]);

  const change = (next: Row<Item>[], focus: FocusTarget, message: string) => {
    focusNext.current = focus;
    setRows(next);
    setAnnouncement(message);
    wiring.notifyChange();
  };

  const move = (index: number, by: -1 | 1) => {
    const row = rows[index];
    if (!row || !rows[index + by]) return;
    const position = index + by + 1;
    change(moveRow(rows, index, by), { rowKey: row.key, control: by < 0 ? "up" : "down" }, `Moved to position ${position} of ${rows.length}.`);
  };

  const remove = (index: number) => {
    const row = rows[index];
    if (!row) return;
    if (rows.length <= limits.min) {
      setAnnouncement(`Keep at least ${countOf(limits.min, noun)}.`);
      return;
    }
    const next = removeRow(rows, index);
    const neighbour = next[index] ?? next[index - 1];
    change(next, neighbour ? { rowKey: neighbour.key, control: "remove" } : { control: "add" }, `Removed ${rowName(noun.one, index)}.`);
  };

  const add = () => {
    added.current += 1;
    const key = `added-${added.current}`;
    change(addRow(rows, blank(), key), { rowKey: key, control: "first-field" }, `Added ${rowName(noun.one, rows.length)}.`);
  };

  const atMost = rows.length >= limits.max;
  const atFewest = rows.length <= limits.min;
  const error = wiring.error;

  return (
    <div
      ref={box}
      role="group"
      aria-labelledby={label ? labelId : undefined}
      aria-label={label ? undefined : noun.many}
      aria-describedby={error ? wiring.errorId : undefined}
      className="grid gap-3"
    >
      {label && (
        <div>
          <p id={labelId} className={labelClasses}>
            {label}
          </p>
          {hint && <p className={cx(hintClasses, "mt-0.5")}>{hint}</p>}
        </div>
      )}
      {!label && hint && <p className={hintClasses}>{hint}</p>}

      {rows.length > 0 && (
        <ul className={cx("grid", variant === "card" ? "gap-4" : "gap-2")}>
          {rows.map((row, index) => {
            const props: ListRowProps<Item> = { item: row.item, path: `${name}.${index}`, index, added: row.added, name: rowName(noun.one, index) };
            const headingId = `${labelId}-${row.key}`;
            const buttons = (
              <RowButtons
                name={props.name}
                first={index === 0}
                last={index === rows.length - 1}
                canRemove={!atFewest}
                onMove={(by) => move(index, by)}
                onRemove={() => remove(index)}
              />
            );
            return (
              <li key={row.key} data-row={row.key}>
                {variant === "card" ? (
                  <section aria-labelledby={headingId} className="rounded-md border border-hairline bg-neutral-25 p-3 sm:p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 id={headingId} className="min-w-0 pt-1.5 text-base font-bold text-ink">
                        {rowTitle?.(props) ?? rowHeading(noun.one, index)}
                      </h3>
                      {buttons}
                    </div>
                    <div className="mt-3 grid gap-5">{children(props)}</div>
                  </section>
                ) : (
                  // Where the row is narrow (a plan's features on a phone), its buttons go under the field.
                  <div className="@container">
                    <div className="flex items-start gap-2 @max-[18rem]:flex-col @max-[18rem]:items-stretch @max-[18rem]:gap-1">
                      <div className="min-w-0 flex-1">{children(props)}</div>
                      <div className="pt-1 @max-[18rem]:self-end @max-[18rem]:pt-0">{buttons}</div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p id={wiring.errorId} className={errorClasses}>
          {error}
        </p>
      )}

      <div data-list-actions className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {atMost ? (
          <p className="text-sm text-fg-3">That&apos;s the most there can be: {countOf(limits.max, noun)}.</p>
        ) : (
          <Button variant="ghost" icon={<Plus aria-hidden="true" />} data-control="add" onClick={add}>
            Add {noun.one}
          </Button>
        )}
        {atFewest && limits.min > 0 && <p className="text-sm text-fg-3">Keep at least {countOf(limits.min, noun)}.</p>}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

function RowButtons({
  name,
  first,
  last,
  canRemove,
  onMove,
  onRemove,
}: {
  name: string;
  first: boolean;
  last: boolean;
  canRemove: boolean;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex shrink-0 gap-2">
      <IconButton size="sm" label={`Move ${name} up`} icon={<ArrowUp />} data-control="up" aria-disabled={first || undefined} onClick={first ? undefined : () => onMove(-1)} />
      <IconButton size="sm" label={`Move ${name} down`} icon={<ArrowDown />} data-control="down" aria-disabled={last || undefined} onClick={last ? undefined : () => onMove(1)} />
      <IconButton size="sm" label={`Remove ${name}`} icon={<Trash2 />} align="end" data-control="remove" aria-disabled={!canRemove || undefined} onClick={onRemove} />
    </div>
  );
}

/** Focuses a control of this list, never of a list inside one of its rows (a plan's features inside a pricing group). */
function focusControl(list: HTMLElement, target: FocusTarget): void {
  if (target.control === "add") {
    list.querySelector<HTMLElement>(':scope > [data-list-actions] [data-control="add"]')?.focus();
    return;
  }
  const row = list.querySelector<HTMLElement>(`:scope > ul > li[data-row="${CSS.escape(target.rowKey)}"]`);
  // A row's own buttons come before anything nested in it, so the first match is its own.
  const control =
    target.control === "first-field"
      ? row?.querySelector<HTMLElement>("input:not([type=hidden]), textarea, select")
      : row?.querySelector<HTMLElement>(`[data-control="${target.control}"]`);
  control?.focus();
}

function countOf(count: number, noun: ListNoun): string {
  return `${count} ${count === 1 ? noun.one : noun.many}`;
}
