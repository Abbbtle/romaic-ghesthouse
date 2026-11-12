"use client";

import Link from "next/link";
import { useState } from "react";
import { adminRoutes } from "../admin-routes";
import { ConfirmButton, type ConfirmedActionResult } from "../confirm-button";
import { EmptyState } from "../empty-state";
import { PageHeader } from "../page-header";
import { StatusPill } from "../status-pill";
import { Cell, HeaderCell, TableFrame } from "../table";
import { useToast } from "../toast";
import { mfaRequiredFor, roleDescriptions } from "@/lib/accounts/access";
import { roleNames, roles as allRoles, type Role } from "@/lib/kernel/actor";
import { savedState } from "@/lib/forms/form-state";
import { AddMember } from "./add-member";
import { TemporaryPasswordPanel } from "./temporary-password-panel";
import type { TeamActions, TeamRow } from "./team-types";

type Revealed = { name: string; password: string; reason: "added" | "reset" };

type TeamManagerProps = {
  members: readonly TeamRow[];
  actions: TeamActions;
  /** The roles the person looking may give a new member; empty when they can't add anyone. */
  addableRoles: readonly Role[];
  /** The dashboard's sign-in page, for the message that goes with a temporary password. */
  signInUrl: string;
};

/**
 * The team page (Pattern 5: who can sign in): everyone with their role and
 * when they last signed in, and what an owner can do about each of them.
 * A new temporary password shows at the top, once.
 */
export function TeamManager({ members, actions, addableRoles, signInUrl }: TeamManagerProps) {
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const toasts = useToast();
  const onlyYou = members.length === 1;

  const reveal = (shown: Revealed) => setRevealed(shown);

  return (
    <>
      <PageHeader
        title="Team"
        description="People who can sign in to the dashboard, and what each role can do."
        actions={
          addableRoles.length > 0 ? (
            <AddMember add={actions.add} roles={addableRoles} onAdded={({ name, temporaryPassword }) => reveal({ name, password: temporaryPassword, reason: "added" })} />
          ) : undefined
        }
      />
      <div className="grid max-w-admin gap-6">
        {revealed && (
          <TemporaryPasswordPanel
            key={revealed.password}
            name={revealed.name}
            password={revealed.password}
            reason={revealed.reason}
            signInUrl={signInUrl}
            onDismiss={() => setRevealed(null)}
          />
        )}

        {/* Phones: a card per person. */}
        <ul aria-label="Team" className="grid gap-3 md:hidden">
          {members.map((member) => (
            <li key={member.id} className="rounded-md border border-hairline bg-white p-4">
              <MemberSummary member={member} />
              <p className="mt-1 text-sm break-all text-fg-2">{member.email}</p>
              <p className="mt-1 text-sm text-fg-3">Last signed in: {member.lastSignedIn}</p>
              <MemberActions member={member} actions={actions} onReset={reveal} onDone={(message) => toasts?.show({ message })} />
            </li>
          ))}
        </ul>

        {/* From 768 px: a table. */}
        <div className="hidden md:block">
          <TableFrame caption="People who can sign in" minWidth="44rem">
            <thead>
              <tr>
                <HeaderCell>Name</HeaderCell>
                <HeaderCell>Email</HeaderCell>
                <HeaderCell>Last signed in</HeaderCell>
                <HeaderCell>
                  <span className="sr-only">Manage</span>
                </HeaderCell>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <Cell>
                    <MemberSummary member={member} />
                  </Cell>
                  <Cell className="break-all text-fg-2">{member.email}</Cell>
                  <Cell className="whitespace-nowrap">{member.lastSignedIn}</Cell>
                  <Cell>
                    <MemberActions member={member} actions={actions} onReset={reveal} onDone={(message) => toasts?.show({ message })} />
                  </Cell>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        </div>

        {onlyYou && (
          <EmptyState title="Only you have access">Add the people who help run the guesthouse. Each role sees only what it needs: staff never see money or guest contact details, and Weberu admins never see money.</EmptyState>
        )}
      </div>
    </>
  );
}

function MemberSummary({ member }: { member: TeamRow }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-bold text-ink">{member.name}</span>
      {member.you && <StatusPill>You</StatusPill>}
      <StatusPill tone={member.role === "owner" ? "success" : "neutral"}>{roleNames[member.role]}</StatusPill>
      {member.disabled && <StatusPill tone="danger">Turned off</StatusPill>}
      {member.temporaryPassword && <StatusPill tone="warning">Temporary password</StatusPill>}
      {!member.mfaEnabled && mfaRequiredFor(member.role) && !member.disabled && <StatusPill tone="warning">No authenticator yet</StatusPill>}
    </div>
  );
}

type MemberActionsProps = {
  member: TeamRow;
  actions: TeamActions;
  onReset: (shown: Revealed) => void;
  onDone: (message: string) => void;
};

/** What the person looking may do about someone else, by their role: never about themselves. */
function MemberActions({ member, actions, onReset, onDone }: MemberActionsProps) {
  if (member.you) {
    return (
      <p className="mt-3 text-sm text-fg-3 md:mt-0">
        Change your own password and authenticator on{" "}
        <Link href={adminRoutes.account} className="font-medium text-link underline underline-offset-4">
          your account page
        </Link>
        .
      </p>
    );
  }
  const { can } = member;
  if (!Object.values(can).some(Boolean)) return <p className="mt-3 text-sm text-fg-3 md:mt-0">Only an owner can change this account.</p>;

  const resetPassword = async (): Promise<ConfirmedActionResult> => {
    const result = await actions.resetPassword(member.id);
    if (result.status !== "reset") return result;
    onReset({ name: member.name, password: result.temporaryPassword, reason: "reset" });
    return savedState("Password reset");
  };

  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 md:mt-0 md:justify-end">
      {can.changeRole &&
        allRoles
          .filter((role) => role !== member.role)
          .map((role) => (
            <ConfirmButton
              key={role}
              variant="ghost"
              size="sm"
              tone="primary"
              title={`Make ${member.name} ${role === "admin" || role === "owner" ? "an" : "a"} ${roleNames[role].toLowerCase()}?`}
              description={`${roleDescriptions[role]} They'll be signed out and sign in again with the new role.`}
              confirmLabel={`Make ${roleNames[role].toLowerCase()}`}
              pendingLabel="Saving…"
              action={() => actions.changeRole(member.id, role)}
              onDone={() => onDone(`${member.name} is now ${roleNames[role].toLowerCase()}`)}
            >
              {`Make ${roleNames[role].toLowerCase()}`}
            </ConfirmButton>
          ))}
      {can.resetPassword && (
        <ConfirmButton
          variant="ghost"
          size="sm"
          tone="primary"
          title={`Reset ${member.name}'s password?`}
          description="They'll be signed out everywhere, and choose a new password when they next sign in with the temporary one you'll see. It stops working after 72 hours. Their authenticator app stays as it is."
          confirmLabel="Reset password"
          pendingLabel="Resetting…"
          action={resetPassword}
        >
          Reset password
        </ConfirmButton>
      )}
      {can.resetMfa && member.mfaEnabled && (
        <ConfirmButton
          variant="ghost"
          size="sm"
          tone="primary"
          title={`Reset ${member.name}'s authenticator?`}
          description="For a lost phone. Their app and recovery codes stop working, they're signed out everywhere, and they set up an authenticator again when they next sign in."
          confirmLabel="Reset authenticator"
          pendingLabel="Resetting…"
          action={() => actions.resetMfa(member.id)}
          onDone={() => onDone(`${member.name}'s authenticator was reset`)}
        >
          Reset authenticator
        </ConfirmButton>
      )}
      {can.setStatus && (
        <ConfirmButton
          variant="ghost"
          size="sm"
          tone={member.disabled ? "primary" : undefined}
          title={member.disabled ? `Turn ${member.name}'s access back on?` : `Turn off ${member.name}'s access?`}
          description={member.disabled ? "They can sign in again." : "They're signed out straight away and can't sign in. Their name stays on what they did."}
          confirmLabel={member.disabled ? "Turn on" : "Turn off"}
          pendingLabel="Saving…"
          action={() => actions.setStatus(member.id, member.disabled ? "active" : "disabled")}
          onDone={() => onDone(member.disabled ? `${member.name} can sign in again` : `${member.name}'s access is off`)}
        >
          {member.disabled ? "Turn on" : "Turn off"}
        </ConfirmButton>
      )}
      {can.remove && (
        <ConfirmButton
          size="sm"
          title={`Remove ${member.name} from the team?`}
          description="Their account is deleted and they lose access straight away. To keep their name on the record, turn their access off instead."
          confirmLabel="Remove person"
          pendingLabel="Removing…"
          action={() => actions.remove(member.id)}
          onDone={() => onDone(`${member.name} removed`)}
        >
          Remove
        </ConfirmButton>
      )}
    </div>
  );
}
