"use client";

import { Plus, TriangleAlert } from "lucide-react";
import { useId, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { DateField, TextField } from "@/components/ui/fields";
import { useFormField, type FieldWiring } from "@/components/ui/form";
import { errorClasses, hintClasses, inputClasses, labelClasses, selectClasses } from "@/components/ui/form-controls";
import { formatCents } from "@/lib/format/money";
import { addDays } from "@/lib/format/zoned-time";
import type { FormAction } from "@/lib/forms/form-state";
import { journalLimits } from "@/lib/ledger/journals";
import { ActionForm } from "../action-form";
import { StatusPill } from "../status-pill";
import type { AccountGroup } from "./account-groups";
import { journalFormProblems, journalTotals } from "./journal-form";

type Row = { key: number; debit: string; credit: string };

const blankRow = (key: number): Row => ({ key, debit: "", credit: "" });

/** A control's error, or its hint, under it. */
function Message({ wiring, hint }: { wiring: FieldWiring; hint?: ReactNode }) {
  if (wiring.error) {
    return (
      <p id={wiring.errorId} className={cx(errorClasses, "mt-1.5")}>
        <TriangleAlert aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-danger" />
        {wiring.error}
      </p>
    );
  }
  return hint ? (
    <p id={wiring.hintId} className={cx(hintClasses, "mt-1.5")}>
      {hint}
    </p>
  ) : null;
}

const describedBy = (wiring: FieldWiring, hint?: ReactNode) => (wiring.error ? wiring.errorId : hint ? wiring.hintId : undefined);

/** The account for a line: the switched-on accounts, grouped by kind. */
function AccountSelect({ name, groups, className }: { name: string; groups: readonly AccountGroup[]; className?: string }) {
  const wiring = useFormField(name);
  return (
    <div className={className}>
      <label htmlFor={wiring.id} className={cx("block", labelClasses)}>
        Account
      </label>
      <select
        id={wiring.id}
        name={name}
        defaultValue=""
        aria-invalid={wiring.error ? true : undefined}
        aria-describedby={describedBy(wiring)}
        className={cx(selectClasses(wiring.density), "mt-1.5")}
      >
        <option value="" disabled>
          Choose an account
        </option>
        {groups.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.accounts.map((account) => (
              <option key={account.code} value={account.code}>
                {account.code} {account.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <Message wiring={wiring} />
    </div>
  );
}

/** A debit or credit in rand, right-aligned in tabular figures; it reports what's typed for the running totals. */
function AmountInput({ name, label, onValueChange, className }: { name: string; label: string; onValueChange: (value: string) => void; className?: string }) {
  const wiring = useFormField(name);
  return (
    <div className={className}>
      <label htmlFor={wiring.id} className={cx("block", labelClasses)}>
        {label}
      </label>
      <input
        id={wiring.id}
        name={name}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        maxLength={16}
        aria-invalid={wiring.error ? true : undefined}
        aria-describedby={describedBy(wiring)}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onValueChange(event.currentTarget.value)}
        className={cx(inputClasses(wiring.density), "mt-1.5 text-right tabular-nums")}
      />
      <Message wiring={wiring} />
    </div>
  );
}

/** One line of the journal: account, debit, credit and an optional note, with Remove once there are more than two. */
function JournalRow({
  position,
  groups,
  canRemove,
  onAmount,
  onRemove,
}: {
  position: number;
  groups: readonly AccountGroup[];
  canRemove: boolean;
  onAmount: (side: "debit" | "credit", value: string) => void;
  onRemove: () => void;
}) {
  const prefix = `line.${position}.`;
  const headingId = useId();
  // Removing a row fires no input event, so the form is told something changed.
  const { notifyChange } = useFormField(`${prefix}account`);
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div role="group" aria-labelledby={headingId} className="grid gap-3">
        <div className="flex min-h-9 items-center justify-between gap-3">
          <p id={headingId} className="text-sm font-bold text-ink">
            Line {position + 1}
          </p>
          {canRemove && (
            <Button
              size="sm"
              variant="ghost-danger"
              onClick={() => {
                onRemove();
                notifyChange();
              }}
            >
              Remove<span className="sr-only"> line {position + 1}</span>
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,2fr)_9rem_9rem_minmax(0,1.5fr)]">
          <AccountSelect name={`${prefix}account`} groups={groups} className="col-span-2 lg:col-span-1" />
          <AmountInput name={`${prefix}debit`} label="Debit (R)" onValueChange={(value) => onAmount("debit", value)} />
          <AmountInput name={`${prefix}credit`} label="Credit (R)" onValueChange={(value) => onAmount("credit", value)} />
          <TextField name={`${prefix}memo`} label="Note" optional maxLength={journalLimits.lineMemoMax} autoComplete="off" className="col-span-2 lg:col-span-1" />
        </div>
      </div>
    </li>
  );
}

/** The running totals, as the money ledger reads: each side, then the difference and whether it balances, in words. */
function Totals({ rows }: { rows: readonly Row[] }) {
  const totals = journalTotals(rows);
  const nothingYet = totals.debitCents === 0 && totals.creditCents === 0;
  const status = nothingYet
    ? "Enter the amounts. Debits and credits must be equal."
    : totals.balanced
      ? "Debits and credits are equal: it balances."
      : totals.differenceCents > 0
        ? `Credits are ${formatCents(totals.differenceCents)} short of the debits.`
        : `Debits are ${formatCents(-totals.differenceCents)} short of the credits.`;
  return (
    <section aria-label="Totals" className="mt-6 max-w-xl rounded-md border border-hairline bg-white">
      <dl className="divide-y divide-hairline">
        <div className="flex items-baseline justify-between gap-4 px-4 py-3">
          <dt className="text-fg-2">Debits</dt>
          <dd className="text-right tabular-nums" data-numeric>
            {formatCents(totals.debitCents)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 px-4 py-3">
          <dt className="text-fg-2">Credits</dt>
          <dd className="text-right tabular-nums" data-numeric>
            {formatCents(totals.creditCents)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 px-4 py-3">
          <dt className="font-bold text-ink">Difference</dt>
          <dd className="text-right text-h4 font-bold text-ink tabular-nums" data-numeric>
            {formatCents(Math.abs(totals.differenceCents))}
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline px-4 py-2.5">
        {!nothingYet && <StatusPill tone={totals.balanced ? "success" : "warning"}>{totals.balanced ? "Balances" : "Doesn't balance yet"}</StatusPill>}
        <p role="status" className="text-sm text-fg-2">
          {status}
        </p>
      </div>
    </section>
  );
}

/**
 * A journal typed in by hand (Pattern: form): its date and what it's for,
 * then lines of account, debit, credit and a note, with running totals that
 * say when it balances. The browser checks what the ledger will (each line
 * has an account and one amount, at least two lines, debits equal credits, a
 * date that isn't too far ahead or in a locked month); the ledger checks
 * again, and the new journal opens once it's posted.
 */
export function ManualJournalForm({
  action,
  groups,
  today,
  lockedPeriods,
  idempotencyKey,
}: {
  action: FormAction;
  groups: readonly AccountGroup[];
  /** "2026-11-12": the default date. */
  today: string;
  lockedPeriods: readonly string[];
  /** Made on the server when the form is shown: a double tap or a resend posts the journal once. */
  idempotencyKey: string;
}) {
  const [rows, setRows] = useState<Row[]>(() => [blankRow(0), blankRow(1)]);
  const nextKey = useRef(2);
  const validate = (data: FormData) => journalFormProblems(Object.fromEntries(data), { today, lockedPeriods });
  const maxDate = addDays(today, 31);

  const setAmount = (key: number, side: "debit" | "credit", value: string) => setRows((current) => current.map((row) => (row.key === key ? { ...row, [side]: value } : row)));

  return (
    <ActionForm action={action} validate={validate} footer="button" submitLabel="Post journal" pendingLabel="Posting…" subject="this journal">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div className="grid max-w-admin gap-8">
        <div className="grid gap-5 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <DateField name="date" label="Date" defaultValue={today} max={maxDate} hint="Up to a month ahead." />
          <TextField name="memo" label="What it's for" maxLength={journalLimits.memoMax} autoComplete="off" placeholder="e.g. Owner paid in money to start the business" />
        </div>

        <section aria-labelledby="journal-lines-title" className="grid gap-4">
          <div className="grid gap-1">
            <h2 id="journal-lines-title" className="text-h4 font-bold text-ink">
              Lines
            </h2>
            <p className="max-w-[62ch] text-sm text-fg-2">
              Put each line&apos;s amount on one side. Debits increase what the business owns and its expenses; credits increase what it owes, the owner&apos;s
              capital and its income. Debits and credits must be equal.
            </p>
          </div>
          <ol className="grid divide-y divide-hairline rounded-md border border-hairline bg-white p-4 lg:p-5">
            {rows.map((row, position) => (
              <JournalRow
                key={row.key}
                position={position}
                groups={groups}
                canRemove={rows.length > 2}
                onAmount={(side, value) => setAmount(row.key, side, value)}
                onRemove={() => setRows((current) => current.filter((candidate) => candidate.key !== row.key))}
              />
            ))}
          </ol>
          {rows.length < journalLimits.maxLines && (
            <div>
              <Button
                size="sm"
                variant="secondary"
                icon={<Plus aria-hidden="true" />}
                onClick={() => {
                  const key = nextKey.current;
                  nextKey.current += 1;
                  setRows((current) => [...current, blankRow(key)]);
                }}
              >
                Add a line
              </Button>
            </div>
          )}
        </section>
      </div>
      <Totals rows={rows} />
    </ActionForm>
  );
}
