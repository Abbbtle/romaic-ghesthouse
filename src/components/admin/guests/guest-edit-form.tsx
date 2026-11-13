"use client";

import { ActionForm } from "../action-form";
import { TextArea, TextField } from "@/components/ui/fields";
import type { FormAction } from "@/lib/forms/form-state";
import type { FieldErrors } from "@/lib/kernel/result";

export type EditableGuest = { id: string; name: string; phone: string; email: string; notes: string };

function guestProblems(data: FormData): FieldErrors {
  const text = (name: string) => String(data.get(name) ?? "").trim();
  if (!text("phone") && !text("email")) return { phone: "Keep a phone number or an email address, so you can reach the guest." };
  return {};
}

/** A guest's name, how to reach them and private notes. Changes show on every booking of theirs. */
export function GuestEditForm({ action, guest }: { action: FormAction; guest: EditableGuest }) {
  return (
    <ActionForm action={action} validate={guestProblems} subject="this guest">
      <input type="hidden" name="guestId" value={guest.id} />
      {/* The panel around the form is titled already, so the fields sit in a plain grid. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="name" label="Name" autoComplete="off" maxLength={120} defaultValue={guest.name} className="sm:col-span-2" />
        <TextField name="phone" label="Mobile number" optional inputMode="tel" autoComplete="off" defaultValue={guest.phone} hint="For WhatsApp and calls." />
        <TextField name="email" label="Email" optional type="email" autoComplete="off" defaultValue={guest.email} />
        <TextArea name="notes" label="Private notes" optional rows={3} maxLength={1000} defaultValue={guest.notes} hint="Only the owner and sales see this." className="sm:col-span-2" />
      </div>
    </ActionForm>
  );
}
