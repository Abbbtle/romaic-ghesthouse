import type { LineView } from "@/lib/bookkeeping/bank-service";
import type { IsoDate } from "@/lib/format/zoned-time";
import { dayLabel } from "../expenses/expense-list";
import { List, ListRow } from "../list";
import { StatusPill } from "../status-pill";
import { lineStatusNames, lineStatusTones, moneyInOut } from "./bank-labels";
import { bankLinePath } from "./bank-paths";

/**
 * Statement lines, newest first, each opening the line to match it. Fixed
 * lines: what the bank called it (with its state), then the day and the
 * amount with its way in words ("R65 out"), never a minus.
 */
export function LineList({ lines, today }: { lines: readonly LineView[]; today: IsoDate }) {
  return (
    <List label="Statement lines">
      {lines.map((line) => (
        <ListRow key={line.id} href={bankLinePath(line.bankAccountId, line.id)}>
          <span className="grid gap-0.5">
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0 font-bold break-words text-ink">{line.description}</span>
              <StatusPill tone={lineStatusTones[line.status]}>{lineStatusNames[line.status]}</StatusPill>
            </span>
            <span className="flex justify-between gap-3 text-sm text-fg-2">
              <span>{dayLabel(line.date, today)}</span>
              <span className="shrink-0 whitespace-nowrap tabular-nums" data-numeric>
                {moneyInOut(line.amountCents)}
              </span>
            </span>
          </span>
        </ListRow>
      ))}
    </List>
  );
}
