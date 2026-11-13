import { LogOut } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChangePasswordForm } from "@/components/admin/account/change-password-form";
import { RecoveryCodes } from "@/components/admin/account/recovery-codes";
import { SignOutEverywhere } from "@/components/admin/account/sign-out-everywhere";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { StatusPill } from "@/components/admin/status-pill";
import { SubmitForm } from "@/components/admin/submit-form";
import { capitalised, whenLabel } from "@/components/admin/when-label";
import { Button } from "@/components/ui/button";
import { anySignedInRole, mfaRequiredFor, resetsPasswordByEmail } from "@/lib/accounts/access";
import { businessTimeZone } from "@/lib/format/zoned-time";
import { roleNames } from "@/lib/kernel/actor";
import { accountServices } from "@/server/accounts";
import { adminPaths } from "@/server/admin-paths";
import { currentSessionToken, requireDashboardActor, requireSignIn } from "@/server/admin-session";
import { clock } from "@/server/infrastructure";
import { changePassword, signOut, signOutEverywhere } from "../../(auth)/actions";
import { endSession, makeRecoveryCodes, sendEmailConfirmation, turnOffAuthenticator } from "./actions";

export const metadata: Metadata = { title: "Account" };

/** The signed-in person's own account: who they are, how they sign in, where they're signed in, and signing out, last. */
export default async function AccountPage({ searchParams }: PageProps<"/admin/account">) {
  const actor = await requireDashboardActor(anySignedInRole);
  const signedIn = await requireSignIn();
  const { notice } = await searchParams;
  const { accounts } = accountServices();
  const [sessions, codesLeft] = await Promise.all([accounts.listSessions(actor, await currentSessionToken()), signedIn.mfaEnabled ? accounts.recoveryCodesLeft(actor) : 0]);
  const now = clock.now();
  const when = (instant: Date) => capitalised(whenLabel(instant, now, businessTimeZone));
  const confirmHref = `${adminPaths.stepUp}?next=${encodeURIComponent(`${adminPaths.home}/account`)}`;

  return (
    <>
      <PageHeader title="Account" description="How you sign in to the dashboard." />
      <div className="grid max-w-form gap-6">
        {notice === "recovery-code-used" && (
          <p role="status" className="rounded-sm border border-hairline bg-warning-50 p-3 text-sm text-warning-800">
            You signed in with a recovery code, so it no longer works. If you&apos;ve lost your phone, ask the owner to reset your authenticator, then make new recovery codes.
          </p>
        )}
        <Panel title="Your details">
          <dl className="grid gap-3 text-base sm:grid-cols-[8rem_minmax(0,1fr)]">
            <dt className="text-sm font-medium text-fg-2">Name</dt>
            <dd className="-mt-2 sm:mt-0">{actor.name}</dd>
            <dt className="text-sm font-medium text-fg-2">Email</dt>
            <dd className="-mt-2 flex flex-wrap items-center gap-2 break-all sm:mt-0">
              {signedIn.email}
              {signedIn.emailVerified ? <StatusPill tone="success">Confirmed</StatusPill> : <StatusPill tone="warning">Not confirmed</StatusPill>}
            </dd>
            <dt className="text-sm font-medium text-fg-2">Role</dt>
            <dd className="-mt-2 sm:mt-0">{roleNames[actor.role]}</dd>
          </dl>
          {!signedIn.emailVerified && (
            <div className="mt-4 grid gap-2 border-t border-hairline pt-4">
              <p className="text-sm text-fg-2">
                {resetsPasswordByEmail(actor.role) ? "Confirm your email so you can reset a forgotten password by email." : "Confirm your email address so we know it reaches you."}
              </p>
              <SubmitForm action={sendEmailConfirmation} submitLabel="Email me a confirmation link" pendingLabel="Sending…">
                <span hidden />
              </SubmitForm>
            </div>
          )}
        </Panel>

        <Panel title="Password" description="Changing it signs you out on your other devices.">
          <ChangePasswordForm action={changePassword} email={signedIn.email} replacingTemporary={false} />
        </Panel>

        <Panel
          title="Authenticator app"
          description={mfaRequiredFor(actor.role) ? "Your role needs a code from your phone each time you sign in." : "Optional for your role: a code from your phone each time you sign in."}
        >
          {signedIn.mfaEnabled ? (
            <div className="grid gap-4">
              <p className="flex items-center gap-2 text-sm text-fg">
                <StatusPill tone="success">On</StatusPill> Signing in asks for a code from your authenticator app.
              </p>
              <RecoveryCodes left={codesLeft} make={makeRecoveryCodes} confirmHref={confirmHref} />
              {!mfaRequiredFor(actor.role) && (
                <div>
                  <ConfirmButton
                    variant="secondary"
                    title="Turn off your authenticator?"
                    description="Signing in will ask only for your password."
                    confirmLabel="Turn off"
                    pendingLabel="Turning off…"
                    action={turnOffAuthenticator}
                  >
                    Turn off
                  </ConfirmButton>
                </div>
              )}
              <p className="text-sm text-fg-3">New phone? Ask an owner to reset your authenticator, then set it up again when you next sign in.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              <p className="text-sm text-fg-2">Not set up. It keeps your account safe even if someone learns your password.</p>
              <div>
                <Link href={adminPaths.mfaSetup} className="inline-flex min-h-11 items-center rounded-sm bg-primary px-4 text-sm font-semibold text-white">
                  Set up an authenticator
                </Link>
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Where you're signed in" description="End a session you don't recognise, or one on a device you no longer have.">
          <ul className="grid gap-3" aria-label="Your sessions">
            {sessions.map((session) => (
              <li key={session.handle} className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-hairline p-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
                    {session.device}
                    {session.current && <StatusPill>This browser</StatusPill>}
                  </p>
                  <p className="text-sm text-fg-3">
                    Signed in {when(session.createdAt)} · last active {when(session.lastActiveAt)}
                  </p>
                </div>
                {!session.current && (
                  <ConfirmButton
                    size="sm"
                    variant="ghost"
                    title="End this session?"
                    description={`${session.device} will be signed out.`}
                    confirmLabel="End session"
                    pendingLabel="Ending…"
                    action={endSession.bind(null, session.handle)}
                  >
                    End session
                  </ConfirmButton>
                )}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Signing out">
          <div className="grid gap-4">
            <p className="text-sm text-fg-2">Lost a phone, or signed in somewhere you shouldn&apos;t stay signed in? Sign out everywhere.</p>
            <div className="flex flex-wrap gap-3">
              <form action={signOut}>
                <Button type="submit" variant="secondary" icon={<LogOut aria-hidden="true" />}>
                  Sign out
                </Button>
              </form>
              <SignOutEverywhere action={signOutEverywhere} />
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
