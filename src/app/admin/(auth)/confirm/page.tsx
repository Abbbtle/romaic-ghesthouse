import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ConfirmIdentityForm } from "@/components/admin/account/email-link-forms";
import { textStyles } from "@/components/ui/typography";
import { nextStepFor } from "@/lib/accounts/access";
import { adminPaths, safeAdminDestination } from "@/server/admin-paths";
import { requireSignIn } from "@/server/admin-session";
import { confirmIdentity } from "../actions";

export const metadata: Metadata = { title: "Confirm it's you" };

export const instant = false;

/**
 * Step-up: before money, tax, team, exports or settings that move money,
 * the dashboard asks for the password (and authenticator code) again,
 * unless they were entered in the last 15 minutes.
 */
export default async function ConfirmPage({ searchParams }: PageProps<"/admin/confirm">) {
  const signedIn = await requireSignIn();
  if (nextStepFor(signedIn) !== "dashboard") redirect(adminPaths.home);
  const { next } = await searchParams;
  const destination = safeAdminDestination(Array.isArray(next) ? next[0] : next);
  return (
    <>
      <h1 className={textStyles.h3}>Confirm it&apos;s you</h1>
      <p className="mt-2 mb-6 text-sm text-fg-2">This part of the dashboard needs your password{signedIn.mfaEnabled ? " and a code from your authenticator app" : ""} again. It stays open for 15 minutes.</p>
      <ConfirmIdentityForm action={confirmIdentity} next={destination} needsCode={signedIn.mfaEnabled} />
      <Link href={adminPaths.home} className="mt-6 inline-flex min-h-11 items-center border-t border-hairline pt-4 text-sm text-fg-2 underline underline-offset-4">
        Back to the dashboard
      </Link>
    </>
  );
}
