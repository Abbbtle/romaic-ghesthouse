import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/admin/account/email-link-forms";
import { textStyles } from "@/components/ui/typography";
import { linkTokenInput } from "@/lib/accounts/input";
import { adminPaths } from "@/server/admin-paths";
import { resetPassword } from "../actions";

export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

/** Where an owner's reset link lands. The link is only checked (and used up) when the form is sent. */
export default async function ResetPasswordPage({ searchParams }: PageProps<"/admin/reset-password">) {
  const { token } = await searchParams;
  const parsed = linkTokenInput.safeParse(Array.isArray(token) ? token[0] : token);
  return (
    <>
      <h1 className={textStyles.h3}>Choose a new password</h1>
      {parsed.success ? (
        <>
          <p className="mt-2 mb-6 text-sm text-fg-2">Setting it signs you out everywhere. Your authenticator app stays as it is.</p>
          <ResetPasswordForm action={resetPassword} token={parsed.data} />
        </>
      ) : (
        <p className="mt-2 text-sm text-fg-2">
          This link isn&apos;t complete.{" "}
          <Link href={adminPaths.forgotPassword} className="font-medium text-fg underline underline-offset-4">
            Ask for a new one
          </Link>
          .
        </p>
      )}
      <p className="mt-6 border-t border-hairline pt-5 text-sm">
        <Link href={adminPaths.signIn} className="font-medium text-fg underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
