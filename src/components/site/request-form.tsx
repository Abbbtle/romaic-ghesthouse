"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, PhoneField, Select, TextArea, TextField } from "@/components/ui/fields";
import { ValidatedForm } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { idleFormState, type FormAction } from "@/lib/forms/form-state";
import type { FieldErrors } from "@/lib/kernel/result";

/** The names the server reads (src/lib/booking/request-input.ts), repeated here so this form doesn't ship the schema to every phone. */
const honeypotFieldName = "rg_hp";
const formTokenFieldName = "formToken";
const limits = { nameMax: 80, arrivalTimeMax: 40, notesMax: 500 } as const;

/** Quick checks as people leave each field; the server checks everything again, properly. */
function quickChecks(data: FormData): FieldErrors {
  const errors: FieldErrors = {};
  const text = (name: string) => String(data.get(name) ?? "").trim();
  if (text("name").length < 2) errors.name = "Enter your name so we know who's coming.";
  if (text("phone").replace(/\D/g, "").length < 9) errors.phone = "Enter your mobile number so we can WhatsApp or call you.";
  const email = text("email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter an email address, like name@example.com, or leave it empty.";
  if (data.get("consent") !== "on") errors.consent = "Tick the box to agree, so we can reply to your request.";
  return errors;
}

type RequestFormProps = {
  action: FormAction;
  /** The signed time the form was shown (the server's spam check). */
  formToken: string;
  apartment: string;
  arrive: string;
  leave: string;
  /** How many guests the search was for, and the most this apartment sleeps. */
  guests: number;
  sleeps: number;
  /** The consent wording from the site's content. */
  consentLabel: string;
  privacyHref: string;
  /** The search's results, offered when the apartment can't be requested any more. */
  backHref: string;
};

function countOptions(from: number, to: number) {
  return Array.from({ length: to - from + 1 }, (_, index) => ({ value: String(from + index), label: String(from + index) }));
}

/**
 * The booking request: who's coming and how to reach them, for the apartment
 * and dates already chosen. Fields are checked as people leave them; the
 * button always works; problems from the server land beside their fields.
 * It posts to the server action itself, so it works before scripts load.
 */
export function RequestForm({ action, formToken, apartment, arrive, leave, guests, sleeps, consentLabel, privacyHref, backHref }: RequestFormProps) {
  const [state, dispatch, pending] = useActionState(action, idleFormState);
  const [adults, setAdults] = useState(Math.max(1, Math.min(guests, sleeps)));
  const [offline, setOffline] = useState(false);
  const banner: ReactNode = offline ? (
    <Notice tone="danger">You&apos;re offline. Check your signal, then try again: what you typed is still here.</Notice>
  ) : (
    state.status === "failed" && (
      <Notice tone="danger">
        {state.message}{" "}
        <Link href={backHref} className="font-bold underline underline-offset-4">
          Choose another apartment
        </Link>
      </Notice>
    )
  );

  return (
    <ValidatedForm
      action={dispatch}
      validate={quickChecks}
      serverErrors={state.status === "invalid" ? state.errors : undefined}
      density="comfortable"
      onValidSubmit={(data) => {
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          setOffline(true);
          return;
        }
        setOffline(false);
        startTransition(() => dispatch(data));
      }}
      aria-busy={pending || undefined}
      aria-label="Booking request"
      banner={banner}
      className="grid gap-6"
    >
      <input type="hidden" name={formTokenFieldName} value={formToken} />
      <input type="hidden" name="apartment" value={apartment} />
      <input type="hidden" name="arrive" value={arrive} />
      <input type="hidden" name="leave" value={leave} />
      {/* For bots only: off-screen, out of the tab order, and named so no autofill rule fills it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={honeypotFieldName}>Leave this empty</label>
        <input id={honeypotFieldName} name={honeypotFieldName} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <fieldset className="grid gap-4">
        <legend className="mb-1 text-h4 font-bold text-ink">Who&rsquo;s coming</legend>
        <div className="grid grid-cols-2 gap-4">
          <Select
            name="adults"
            label="Adults"
            options={countOptions(1, sleeps)}
            defaultValue={String(adults)}
            onValueChange={(value) => setAdults(Number(value))}
          />
          <Select name="children" label="Children" options={countOptions(0, Math.max(0, sleeps - adults))} defaultValue="0" />
        </div>
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-1 text-h4 font-bold text-ink">Your details</legend>
        <TextField name="name" label="Your name" autoComplete="name" maxLength={limits.nameMax} />
        <PhoneField name="phone" label="Mobile number" hint="We'll WhatsApp or call you on this number." />
        <TextField name="email" type="email" label="Email" optional autoComplete="email" inputMode="email" hint="If you'd like our reply by email too." />
        <TextField name="arrivalTime" label="Roughly when you'll arrive" optional maxLength={limits.arrivalTimeMax} placeholder="e.g. about 18:00" />
        <TextArea
          name="notes"
          label="Anything we should know"
          optional
          rows={3}
          maxLength={limits.notesMax}
          hint="Please don't include ID numbers, card details or health information."
        />
      </fieldset>

      <Checkbox
        name="consent"
        required
        label={consentLabel}
        hint={
          <Link href={privacyHref} className="font-bold text-link underline underline-offset-4 hover:text-link-hover">
            Read the privacy notice
          </Link>
        }
      />

      <div className="grid gap-3">
        <Button type="submit" size="lg" fullWidth pending={pending} pendingLabel="Sending…">
          Send request
        </Button>
        <p className="text-sm text-fg-2">Sending this doesn&rsquo;t book or charge anything. We reply to confirm.</p>
      </div>
    </ValidatedForm>
  );
}
