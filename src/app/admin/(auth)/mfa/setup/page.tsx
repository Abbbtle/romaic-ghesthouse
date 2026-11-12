import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { renderSVG } from "uqr";
import { MfaSetupForm } from "@/components/admin/account/mfa-setup-form";
import { textStyles } from "@/components/ui/typography";
import { accountServices } from "@/server/accounts";
import { adminPaths } from "@/server/admin-paths";
import { currentSessionToken, requireSignIn } from "@/server/admin-session";
import { confirmMfaSetup, signOut } from "../../actions";

export const metadata: Metadata = { title: "Set up your authenticator" };

export const instant = false;

/** Groups a Base32 secret in fours, so it's easier to type into an app by hand. */
function grouped(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Setting up an authenticator app: required for owners, admins and sales
 * before the dashboard opens, optional for staff (from their account page).
 * The QR code holds the otpauth link; on a phone, the link itself opens the
 * authenticator app. Each visit starts a fresh, unconfirmed secret.
 *
 * Once an authenticator is on, the page stays rather than redirecting:
 * confirming the first code sets the new session cookie, Next.js renders the
 * page again in the same response, and the recovery codes the form is
 * showing must survive that. So the form keeps its place in the tree either
 * way, and only the instructions around it come and go.
 */
export default async function MfaSetupPage() {
  const signedIn = await requireSignIn();
  if (signedIn.mfaDue) redirect(adminPaths.mfa);
  if (signedIn.mustChangePassword) redirect(adminPaths.changePassword);
  const started = signedIn.mfaEnabled ? null : await accountServices().accounts.beginMfaEnrolment(await currentSessionToken());
  if (started && !started.ok) redirect(adminPaths.home);
  const enrolment = started?.ok ? started : null;
  const qr = enrolment
    ? `data:image/svg+xml;utf8,${encodeURIComponent(renderSVG(enrolment.uri, { ecc: "M", pixelSize: 6, blackColor: "#151316", whiteColor: "#FFFFFF" }))}`
    : null;
  return (
    <>
      <h1 className={textStyles.h3}>{enrolment ? "Set up your authenticator app" : "Your authenticator app"}</h1>
      <p className="mt-2 text-sm text-fg-2">
        {!enrolment
          ? "Signing in asks for a code from the app on your phone as well as your password."
          : signedIn.mfaEnrolmentDue
            ? "Your role needs a code from an app on your phone each time you sign in, as well as your password."
            : "Signing in will ask for a code from an app on your phone as well as your password."}
      </p>
      {enrolment && qr && (
        <ol className="mt-5 space-y-4 text-sm text-fg">
          <li>
            <span className="font-medium">1. Install an authenticator app</span>, such as Google Authenticator or Microsoft Authenticator, if you don&apos;t have one.
          </li>
          <li>
            <span className="font-medium">2. Add Romaic Guesthouse to it.</span> Scan this code, or on this phone{" "}
            <a href={enrolment.uri} className="font-medium underline underline-offset-4">
              open the app with this link
            </a>
            .
            {/* eslint-disable-next-line @next/next/no-img-element -- a small SVG made here, not a photo */}
            <img src={qr} alt="QR code to add Romaic Guesthouse to an authenticator app" width={180} height={180} className="mt-3 rounded-sm border border-hairline" />
            <span className="mt-2 block text-fg-2">
              Or type this key: <span className="font-mono text-fg select-all">{grouped(enrolment.secret)}</span>
            </span>
          </li>
          <li>
            <span className="font-medium">3. Type the 6-digit code</span> the app now shows.
          </li>
        </ol>
      )}
      <div className="mt-5">
        <MfaSetupForm key="mfa-setup-form" action={confirmMfaSetup} continueHref={adminPaths.home} alreadySetUp={!enrolment} />
      </div>
      <form action={signOut} className="mt-6 border-t border-hairline pt-4">
        <button type="submit" className="inline-flex min-h-11 items-center text-sm text-fg-2 underline underline-offset-4 hover:text-fg">
          Sign out
        </button>
      </form>
    </>
  );
}
