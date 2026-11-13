import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { textStyles } from "@/components/ui/typography";
import { accountServices } from "@/server/accounts";
import { adminPaths } from "@/server/admin-paths";
import { setUp } from "../actions";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Set up the dashboard" };

/** Whether setup is still open is in the database, so the page waits for it (see ../sign-in/page.tsx). */
export const instant = false;

/** First run only: creates the first owner. Once anyone has an account, this sends people to sign in. */
export default async function SetupPage() {
  // Whether setup is done is in the database, which is read per request, never at build time.
  await connection();
  const status = await accountServices().setup.status();
  if (status === "done") redirect(adminPaths.signIn);

  return (
    <>
      <h1 className={textStyles.h3}>Set up the dashboard</h1>
      {status === "locked" ? (
        <div className="mt-3 grid gap-3 text-sm text-fg-2">
          <p>
            To create the first account on the live site, set <code className="font-medium text-fg">ADMIN_SETUP_TOKEN</code> to a long
            random value in the hosting settings, redeploy, and come back here. You&apos;ll be asked for it, so only someone who runs the
            site can claim the dashboard.
          </p>
          <p>
            <Link href="/" className="inline-flex min-h-11 items-center font-medium text-link underline underline-offset-4">
              Back to the website
            </Link>
          </p>
        </div>
      ) : (
        <>
          <p className="mt-2 mb-6 text-sm text-fg-2">Create the first account. You&apos;ll be its owner, and can add the rest of the team.</p>
          <SetupForm action={setUp} needsToken={status === "needs-token"} />
        </>
      )}
    </>
  );
}
