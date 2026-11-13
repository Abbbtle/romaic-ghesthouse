import type { Metadata } from "next";
import Link from "next/link";
import { EmailLinkForm } from "@/components/admin/account/email-link-forms";
import { textStyles } from "@/components/ui/typography";
import { adminPaths } from "@/server/admin-paths";
import { requestPasswordReset } from "../actions";

export const metadata: Metadata = { title: "Reset your password" };

/** Owners only: a reset link by email, to an address they've verified. */
export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className={textStyles.h3}>Reset your password</h1>
      <p className="mt-2 mb-6 text-sm text-fg-2">
        For owners whose email address is confirmed. We&apos;ll email a link that works for 30 minutes. You&apos;ll still need your authenticator code to sign in.
      </p>
      <EmailLinkForm action={requestPasswordReset} />
      <p className="mt-6 border-t border-hairline pt-5 text-sm text-fg-2">
        Sales and staff: ask the owner to set a temporary password for you.{" "}
        <Link href={adminPaths.signIn} className="font-medium text-fg underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
