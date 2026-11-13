import type { Metadata } from "next";
import Link from "next/link";
import { VerifyEmailForm } from "@/components/admin/account/email-link-forms";
import { textStyles } from "@/components/ui/typography";
import { linkTokenInput } from "@/lib/accounts/input";
import { adminPaths } from "@/server/admin-paths";
import { verifyEmail } from "../actions";

export const metadata: Metadata = { title: "Confirm your email", referrer: "no-referrer" };

/**
 * Where an email verification link lands. Confirming takes a button press,
 * so a mail scanner that opens links can't use the link up.
 */
export default async function VerifyEmailPage({ searchParams }: PageProps<"/admin/verify-email">) {
  const { token } = await searchParams;
  const parsed = linkTokenInput.safeParse(Array.isArray(token) ? token[0] : token);
  return (
    <>
      <h1 className={textStyles.h3}>Confirm your email address</h1>
      {parsed.success ? (
        <>
          <p className="mt-2 mb-6 text-sm text-fg-2">Owners need a confirmed address to reset a forgotten password by email.</p>
          <VerifyEmailForm action={verifyEmail} token={parsed.data} />
        </>
      ) : (
        <p className="mt-2 text-sm text-fg-2">
          This link isn&apos;t complete. Ask for a new one from{" "}
          <Link href={`${adminPaths.home}/account`} className="font-medium text-fg underline underline-offset-4">
            your account page
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
