import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MfaCodeForm } from "@/components/admin/account/mfa-code-form";
import { textStyles } from "@/components/ui/typography";
import { adminPaths, safeAdminDestination } from "@/server/admin-paths";
import { requireSignIn } from "@/server/admin-session";
import { signOut, verifyMfa } from "../actions";

export const metadata: Metadata = { title: "Enter your code" };

export const instant = false;

/** The authenticator step of signing in, after the password. */
export default async function MfaPage({ searchParams }: PageProps<"/admin/mfa">) {
  const signedIn = await requireSignIn();
  if (!signedIn.mfaDue) redirect(adminPaths.home);
  const { next } = await searchParams;
  const destination = safeAdminDestination(Array.isArray(next) ? next[0] : next);
  return (
    <>
      <h1 className={textStyles.h3}>Enter your code</h1>
      <p className="mt-2 mb-6 text-sm text-fg-2">Open your authenticator app and type the 6-digit code it shows for Romaic Guesthouse.</p>
      <MfaCodeForm action={verifyMfa} next={destination} submitLabel="Continue" />
      <details className="mt-6 border-t border-hairline pt-4 text-sm text-fg-2">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-fg">Lost your phone?</summary>
        <p className="mt-2">
          Type one of the recovery codes you saved when you set up your app (like <span className="font-mono">kd7m3-xqpv9</span>). Each works once. If you have none left, ask the owner (or, for an owner, Weberu) to reset your
          authenticator.
        </p>
      </details>
      <form action={signOut} className="mt-4">
        <button type="submit" className="inline-flex min-h-11 items-center text-sm text-fg-2 underline underline-offset-4 hover:text-fg">
          Sign out
        </button>
      </form>
    </>
  );
}
