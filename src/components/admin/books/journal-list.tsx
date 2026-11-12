import { formatDateShort, formatDayShort } from "@/lib/format/date-time";
import { formatCents } from "@/lib/format/money";
import type { IsoDate } from "@/lib/format/zoned-time";
import { journalAmount, type Journal } from "@/lib/ledger/journals";
import { adminRoutes } from "../admin-routes";
import { List, ListRow } from "../list";
import { StatusPill } from "../status-pill";

export const journalsPath = `${adminRoutes.books}/journals`;

export function journalPath(id: string): string {
  return `${journalsPath}/${encodeURIComponent(id)}`;
}

/** A journal's date in a list: "Thu 12 Nov" this year, "12 Nov 2025" before it. */
export function journalDateLabel(date: IsoDate, today: IsoDate): string {
  return date.slice(0, 4) === today.slice(0, 4) ? formatDayShort(date) : formatDateShort(date);
}

/**
 * Journals as a list, newest first, each row opening the journal. Fixed
 * lines so a phone reads them the same each time: what it was for (with
 * "Reversed" or "Reversal" where it applies), then the date and the amount.
 */
export function JournalList({ journals, reversed, today, label }: { journals: readonly Journal[]; reversed: ReadonlySet<string>; today: IsoDate; label: string }) {
  return (
    <List label={label}>
      {journals.map((journal) => (
        <ListRow key={journal.id} href={journalPath(journal.id)}>
          <span className="grid gap-0.5">
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0 font-bold break-words text-ink">{journal.memo}</span>
              {journal.reversalOf ? <StatusPill tone="info">Reversal</StatusPill> : reversed.has(journal.id) ? <StatusPill>Reversed</StatusPill> : null}
            </span>
            <span className="flex justify-between gap-3 text-sm text-fg-2">
              <span>{journalDateLabel(journal.date, today)}</span>
              <span className="tabular-nums" data-numeric>
                {formatCents(journalAmount(journal))}
              </span>
            </span>
          </span>
        </ListRow>
      ))}
    </List>
  );
}
