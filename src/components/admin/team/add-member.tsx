"use client";

import { UserPlus } from "lucide-react";
import { useId, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { RadioCards, TextField } from "@/components/ui/fields";
import { ValidatedForm } from "@/components/ui/form";
import { Notice } from "@/components/ui/notice";
import { Sheet } from "@/components/ui/sheet";
import { accountLimits, addMemberInput } from "@/lib/accounts/input";
import type { FieldErrors } from "@/lib/kernel/result";
import { formValidator } from "../form-validator";
import { callServerAction } from "../server-call";
import { roleDescriptions } from "@/lib/accounts/access";
import { roleNames, type Role } from "@/lib/kernel/actor";
import type { TeamActions } from "./team-types";

const validate = formValidator(addMemberInput);

/** The roles the person adding someone may give, with what each can do. */
export function roleChoicesFor(roles: readonly Role[]) {
  return roles.map((role) => ({ value: role, label: roleNames[role], description: roleDescriptions[role] }));
}

const signedOutMessage = "You've been signed out. Sign in again in another tab, then add them again.";
const connectionFailure = "They weren't added. Check your connection and try again.";

type AddMemberProps = {
  add: TeamActions["add"];
  /** The roles the person adding may give (owners: any; admins: staff only). */
  roles: readonly Role[];
  /** With the new person's name and temporary password, once they're added. */
  onAdded: (added: { name: string; temporaryPassword: string }) => void;
};

/**
 * "Add person" and its slide-over (design-spec §10.8, a task of a few
 * seconds that keeps the team in view): name, email and role. The new
 * person gets a temporary password, which the team page then shows once.
 */
export function AddMember({ add, roles, onAdded }: AddMemberProps) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<FieldErrors | undefined>(undefined);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const trigger = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const formId = useId();

  const close = () => {
    setOpen(false);
    setFailure(null);
    setErrors(undefined);
  };

  const submit = (data: FormData) =>
    startTransition(async () => {
      setFailure(null);
      const result = await callServerAction(() => add(data), () => ({ status: "failed" as const, message: connectionFailure }));
      switch (result.status) {
        case "added":
          form.current?.reset();
          close();
          onAdded({ name: result.name, temporaryPassword: result.temporaryPassword });
          return;
        case "invalid":
          setErrors(result.errors);
          return;
        case "failed":
          setFailure(result.message);
          return;
        case "signed-out":
          setFailure(signedOutMessage);
          return;
        case "step-up":
          setFailure("For your security, reload the page and confirm your password and code, then add them again.");
          return;
      }
    });

  return (
    <>
      <Button ref={trigger} icon={<UserPlus aria-hidden="true" />} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        Add person
      </Button>
      <Sheet
        open={open}
        onClose={close}
        returnFocus={trigger}
        title="Add a person"
        description="They'll get a temporary password to sign in with, and choose their own straight away."
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" form={formId} pending={pending} pendingLabel="Adding…">
              Add person
            </Button>
          </div>
        }
      >
        <ValidatedForm
          ref={form}
          id={formId}
          validate={validate}
          serverErrors={errors}
          onValidSubmit={submit}
          aria-busy={pending || undefined}
          banner={failure && <Notice tone="danger">{failure}</Notice>}
          className="grid gap-5 pt-2"
        >
          <TextField name="name" label="Name" autoComplete="off" maxLength={accountLimits.name} />
          <TextField name="email" label="Email" type="email" inputMode="email" autoComplete="off" maxLength={accountLimits.email} />
          <RadioCards name="role" label="Role" columns={1} defaultValue={roles[roles.length - 1]} options={roleChoicesFor(roles)} />
        </ValidatedForm>
      </Sheet>
    </>
  );
}
