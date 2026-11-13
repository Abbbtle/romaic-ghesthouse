"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { Switch, TextField } from "@/components/ui/fields";
import { failedState, type FormAction } from "@/lib/forms/form-state";
import { parseWith } from "@/lib/forms/parse";
import type { FieldErrors } from "@/lib/kernel/result";
import { accountKindNames, kindOfCode } from "@/lib/ledger/accounts";
import { newAccountSchema } from "@/lib/ledger/ledger-input";
import { ActionForm } from "../action-form";
import type { ConfirmedActionResult } from "../confirm-button";
import { callServerAction } from "../server-call";
import { SheetForm } from "../sheet-form";
import { useToast } from "../toast";

function problemOf(result: ConfirmedActionResult): string | null {
  if (!result) return null;
  switch (result.status) {
    case "failed":
      return result.message;
    case "invalid":
      return Object.values(result.errors)[0] ?? "That didn't save. Reload the page and try again.";
    case "signed-out":
      return "You've been signed out. Sign in again in another tab, then try again.";
    case "step-up":
      return "For your security, reload the page and confirm your password and code, then try again.";
    default:
      return null;
  }
}

/**
 * An account's switch, saved as it's flipped (with Undo in the toast). An
 * account that's off can't be chosen for new journals; its history stays.
 */
export function AccountSwitch({
  code,
  name,
  active,
  action,
}: {
  code: string;
  name: string;
  active: boolean;
  action: (code: string, active: boolean) => Promise<ConfirmedActionResult>;
}) {
  const toasts = useToast();
  const [on, setOn] = useState(active);
  // The switch is drawn afresh only when its state changes without a press (a failed save, Undo), so a keyboard press keeps its focus.
  const [drawn, setDrawn] = useState(0);
  const [, startSaving] = useTransition();
  const redraw = () => setDrawn((count) => count + 1);

  function toggle(next: boolean, pressed: boolean) {
    setOn(next);
    if (!pressed) redraw();
    startSaving(async () => {
      const problem = problemOf(await callServerAction(() => action(code, next), () => failedState("That didn't save: check your connection and try again.")));
      if (problem) {
        setOn(!next);
        redraw();
        toasts?.show({ message: problem, tone: "error" });
        return;
      }
      toasts?.show({ message: `${code} ${name} ${next ? "is on" : "is off"}`, action: pressed ? { label: "Undo", onSelect: () => toggle(!next, false) } : undefined });
    });
  }

  return <Switch key={drawn} name={`account-${code}`} label={`Use ${code} ${name}`} hideLabel defaultChecked={on} onCheckedChange={(checked) => toggle(checked, true)} />;
}

const kindHint = "Four digits. The first sets the kind: 1 assets, 2 liabilities, 3 equity, 4 income, 5 or 6 expenses.";

/** "Add an account" and its sheet: a code and a name. The code's first digit sets its kind. */
export function AddAccountSheet({ action, takenCodes }: { action: FormAction; takenCodes: readonly string[] }) {
  const [code, setCode] = useState("");
  const kind = /^[1-6]\d{3}$/.test(code.trim()) ? kindOfCode(code.trim()) : null;

  const problems = (data: FormData): FieldErrors => {
    const parsed = parseWith(newAccountSchema, Object.fromEntries(data));
    const errors = parsed.ok ? {} : { ...parsed.errors };
    if (!errors.code && takenCodes.includes(String(data.get("code") ?? "").trim())) errors.code = "Another account already has this code.";
    return errors;
  };

  return (
    <SheetForm
      trigger="Add an account"
      icon={<Plus aria-hidden="true" />}
      variant="primary"
      size="sm"
      title="Add an account"
      description="For something the chart doesn't have yet, such as a second bank account or a new kind of expense. Your accountant may have a code in mind."
    >
      {(close) => (
        <ActionForm
          action={action}
          validate={problems}
          footer="button"
          submitLabel="Add account"
          pendingLabel="Adding…"
          subject="this account"
          resetOnSave
          onSaved={() => {
            setCode("");
            close();
          }}
        >
          <div className="grid gap-5">
            <TextField
              name="code"
              label="Code"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              placeholder="e.g. 5250"
              hint={kind ? `${accountKindNames[kind]}. ${kindHint}` : kindHint}
              onValueChange={setCode}
            />
            <TextField name="name" label="Name" autoComplete="off" maxLength={60} placeholder="e.g. Garden services" />
          </div>
        </ActionForm>
      )}
    </SheetForm>
  );
}
