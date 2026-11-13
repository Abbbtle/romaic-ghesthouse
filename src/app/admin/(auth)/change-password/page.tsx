import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/admin/account/change-password-form";
import { textStyles } from "@/components/ui/typography";
import { adminPaths } from "@/server/admin-paths";
import { requireSignIn } from "@/server/admin-session";
import { changePassword, signOut } from "../actions";

export const metadata: Metadata = { title: "Change password" };

/** Who's signed in decides what this page shows, so it waits for the session (see ../sign-in/page.tsx). */
export const instant = false;

/**
 * Where someone with a temporary password must go before anything else, to
 * choose their own; and where anyone signed in can change theirs.
 */
export default async function ChangePasswordPage() {
  const { email, mustChangePassword, mfaDue } = await requireSignIn();
  if (mfaDue) redirect(adminPaths.mfa);

  return (
    <>
      <h1 className={textStyles.h3}>{mustChangePassword ? "Choose your own password" : "Change your password"}</h1>
      <p className="mt-2 mb-6 text-sm text-fg-2">
        {mustChangePassword
          ? "You signed in with a temporary password. Choose one only you know to carry on."
          : "Changing it signs you out on your other devices."}
      </p>
      <ChangePasswordForm action={changePassword} email={email} replacingTemporary={mustChangePassword} />
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-4 text-sm">
        {!mustChangePassword && (
          <Link href={adminPaths.home} className="inline-flex min-h-11 items-center font-medium text-link underline underline-offset-4">
            Back to the dashboard
          </Link>
        )}
        <form action={signOut}>
          <button type="submit" className="inline-flex min-h-11 items-center text-fg-2 underline underline-offset-4 hover:text-fg">
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}
