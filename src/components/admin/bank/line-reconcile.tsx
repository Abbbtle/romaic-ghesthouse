"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Select } from "@/components/ui/fields";
import { lineJournalSchema } from "@/lib/bookkeeping/bookkeeping-input";
import { lineKindNames, type LineKind } from "@/lib/bookkeeping/bank";
import type { FormAction } from "@/lib/forms/form-state";
import { ActionForm } from "../action-form";
import { ConfirmButton, type ConfirmedActionResult } from "../confirm-button";
import { formValidator } from "../form-validator";
import { Panel } from "../panel";
import { useQuickAction, type QuickResult } from "../tasks/use-quick-action";
import { useToast } from "../toast";

const validate = formValidator(lineJournalSchema);

/** A journal that could be the line, worded on the server. */
export type SuggestionRow = { journalId: string; memo: string; /** "Sun 1 Nov, 2 days before". */ when: string; amount: string; href: string };

export type Choice = { code: string; name: string };

/** What each kind is called for money in, and for money out. */
const kindLabels: Record<LineKind, { in: string; out: string }> = {
  "channel-payout": { in: "A channel's payout", out: "Taken back by a channel" },
  owner: { in: "The owner putting money in", out: "The owner taking money out" },
  "bank-charges": { in: "Bank charges refunded", out: "Bank charges" },
  transfer: { in: "A transfer from another of your accounts", out: "A transfer to another of your accounts" },
  other: { in: lineKindNames.other, out: lineKindNames.other },
};

const kindsFor = (moneyIn: boolean): LineKind[] => (moneyIn ? ["channel-payout", "owner", "transfer", "other"] : ["bank-charges", "owner", "transfer", "channel-payout", "other"]);

function MatchButton({ primary, onMatch }: { primary: boolean; onMatch: () => Promise<QuickResult> }) {
  const matching = useQuickAction();
  return (
    <span className="grid justify-items-end gap-1">
      <Button size="sm" variant={primary ? "primary" : "secondary"} pending={matching.pending} pendingLabel="Matching…" onClick={() => matching.run(onMatch, "Matched")}>
        Match
      </Button>
      {matching.problem && (
        <span role="alert" className="text-sm font-medium text-danger-700">
          {matching.problem}
        </span>
      )}
    </span>
  );
}

/**
 * Reconciling one statement line: match it to a journal already in the
 * books (closest first), record it as an expense, or make a journal from it
 * (a channel's payout, the owner's money, bank charges, a transfer, another
 * account). A matched line can be unmatched while its journal stands.
 */
export function LineReconcile({
  lineId,
  moneyIn,
  matched,
  suggestions,
  choices,
  expenseHref,
  locked,
  actions,
}: {
  lineId: string;
  moneyIn: boolean;
  /** The journal it's matched to, when it stands. */
  matched: { memo: string; when: string; href: string; made: boolean } | null;
  suggestions: readonly SuggestionRow[];
  choices: { channels: Choice[]; transfers: Choice[]; others: Choice[] };
  /** Where to record money out as an expense; null for money in. */
  expenseHref: string | null;
  locked: boolean;
  actions: {
    match: (lineId: string, journalId: string) => Promise<QuickResult>;
    make: FormAction;
    unmatch: (lineId: string) => Promise<ConfirmedActionResult>;
  };
}) {
  const [kind, setKind] = useState<LineKind>(moneyIn ? "channel-payout" : "bank-charges");
  const toasts = useToast();

  if (matched) {
    return (
      <Panel title="Matched to" flush>
        <div className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center lg:px-5">
          <Link href={matched.href} className="grid min-w-0 gap-0.5 rounded-xs -outline-offset-2">
            <span className="font-bold break-words text-link underline underline-offset-4">{matched.memo}</span>
            <span className="text-sm text-fg-2">{matched.when}</span>
          </Link>
          <ConfirmButton
            size="sm"
            title="Unmatch this line?"
            description={
              matched.made
                ? "The journal made from this line is reversed, and the line goes back with those not matched yet."
                : "The journal stays in the books as it is; only the match is undone, and the line goes back with those not matched yet."
            }
            confirmLabel={matched.made ? "Unmatch and reverse" : "Unmatch"}
            pendingLabel="Unmatching…"
            action={() => actions.unmatch(lineId)}
            onDone={() => toasts?.show({ message: "Unmatched" })}
          >
            Unmatch
          </ConfirmButton>
        </div>
      </Panel>
    );
  }

  const options = kind === "channel-payout" ? choices.channels : kind === "transfer" ? choices.transfers : kind === "other" ? choices.others : null;

  return (
    <div className="grid gap-5">
      <Panel title="Already in the books?" description="Journals on this account for the same amount, within a week of the line. A guest's EFT recorded on its booking shows here." flush>
        {suggestions.length > 0 ? (
          <ul className="divide-y divide-hairline">
            {suggestions.map((suggestion, index) => (
              <li key={suggestion.journalId} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center lg:px-5">
                <span className="grid min-w-0 gap-0.5">
                  <Link href={suggestion.href} className="font-bold break-words text-ink underline-offset-4 hover:underline">
                    {suggestion.memo}
                  </Link>
                  <span className="flex justify-between gap-3 text-sm text-fg-2">
                    <span>{suggestion.when}</span>
                    <span className="tabular-nums" data-numeric>
                      {suggestion.amount}
                    </span>
                  </span>
                </span>
                <MatchButton primary={index === 0} onMatch={() => actions.match(lineId, suggestion.journalId)} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-3 text-sm text-fg-2 lg:px-5">Nothing in the books matches it yet.</p>
        )}
      </Panel>

      {expenseHref && (
        <Panel title="An expense?" description="Record what it paid for. The expense is posted to the books and matched to this line.">
          <ButtonLink href={expenseHref} size="sm" variant="secondary">
            Record as an expense
          </ButtonLink>
        </Panel>
      )}

      <Panel title="Something else?" description="Record it in the books from the line itself, and match it.">
        {locked ? (
          <p className="text-sm text-fg-2">This line&rsquo;s month is locked in the books, so nothing can be recorded in it. Reopen the month on the Months tab first.</p>
        ) : (
          <ActionForm
            action={actions.make}
            validate={validate}
            footer="button"
            submitLabel="Record and match"
            pendingLabel="Recording…"
            submitVariant={suggestions.length > 0 ? "secondary" : "primary"}
            subject="this line"
            className="grid max-w-xl gap-4"
          >
            <input type="hidden" name="lineId" value={lineId} />
            <Select
              name="kind"
              label="It's"
              defaultValue={kind}
              options={kindsFor(moneyIn).map((value) => ({ value, label: kindLabels[value][moneyIn ? "in" : "out"] }))}
              onValueChange={(value) => setKind(value as LineKind)}
            />
            {options && (
              <Select
                key={kind}
                name="account"
                label={kind === "channel-payout" ? "Which channel" : kind === "transfer" ? (moneyIn ? "From which account" : "To which account") : "Which account"}
                placeholder="Choose one"
                options={options.map((choice) => ({ value: choice.code, label: choice.name }))}
                hint={kind === "channel-payout" ? "What the channel collected from guests and still owed you." : undefined}
              />
            )}
            {kind === "owner" && <p className="text-sm text-fg-2">{moneyIn ? "Recorded as owner's capital." : "Recorded as the owner's drawings."}</p>}
            {kind === "bank-charges" && <p className="text-sm text-fg-2">Recorded under gateway and bank charges.</p>}
          </ActionForm>
        )}
      </Panel>
    </div>
  );
}
