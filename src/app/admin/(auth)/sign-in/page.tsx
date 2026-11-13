import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { textStyles } from "@/components/ui/typography";
import { nextStepFor } from "@/lib/accounts/access";
import { accountServices } from "@/server/accounts";
import { adminPaths, safeAdminDestination } from "@/server/admin-paths";
import { currentSignIn } from "@/server/admin-session";
import { signIn } from "../actions";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Who's signed in decides what this page does (it may redirect), so it
 * always waits for the session rather than showing a placeholder first.
 */
export const instant = false;

const stepPaths = {
  mfa: adminPaths.mfa,
  "change-password": adminPaths.changePassword,
  "mfa-setup": adminPaths.mfaSetup,
} as const;

export default async function SignInPage({ searchParams }: PageProps<"/admin/sign-in">) {
  const { next, notice } = await searchParams;
  const destination = safeAdminDestination(Array.isArray(next) ? next[0] : next);
  const signedIn = await currentSignIn();
  if (signedIn) {
    const step = nextStepFor(signedIn);
    redirect(step === "dashboard" ? destination : stepPaths[step]);
  }
  // A fresh site has nobody to sign in as yet.
  if ((await accountServices().setup.status()) !== "done") redirect(adminPaths.setup);
  return (
    <>
      <h1 className={textStyles.h3}>Sign in</h1>
      <p className="mt-2 mb-6 text-sm text-fg-2">To manage bookings, the website and the business.</p>
      {notice === "password-reset" && (
        <p role="status" className="mb-5 rounded-sm border border-hairline bg-surface-2 p-3 text-sm text-fg">
          Your password has been reset. Sign in with it now; you&apos;ll still need your authenticator code.
        </p>
      )}
      <SignInForm action={signIn} next={destination} />
      <div className="mt-6 space-y-2 border-t border-hairline pt-5 text-sm text-fg-2">
        <p>
          <span className="font-medium text-fg">Forgotten your password?</span> Sales and staff: ask the owner to set a temporary one for you.
        </p>
        <p>
          Owners can{" "}
          <Link href={adminPaths.forgotPassword} className="font-medium text-fg underline underline-offset-4">
            get a reset link by email
          </Link>
          .
        </p>
      </div>
    </>
  );
}
