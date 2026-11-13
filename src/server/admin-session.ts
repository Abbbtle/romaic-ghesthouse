import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { dashboardAccess, type DashboardRequirement, type SignInStep } from "@/lib/accounts/access";
import type { SignedIn } from "@/lib/accounts/account-service";
import { describeDevice, type NewSession } from "@/lib/accounts/sessions";
import type { Actor } from "@/lib/kernel/actor";
import { accountServices } from "./accounts";
import { clock } from "./infrastructure";
import { adminPaths, requestedPathHeader, safeAdminDestination, signInPath } from "./admin-paths";
import { clearedSessionCookieOptions, sessionCookie, sessionCookieOptions } from "./session-cookie";

/**
 * Who's signed in to the dashboard. Every admin page, server action and
 * route handler checks this itself: the proxy only looks for the cookie, and
 * a page that hides a button isn't protection.
 */

/** This request's session, checked once per request (and extended if it's due). */
const signedIn = cache(async (): Promise<SignedIn | null> => {
  // Read the cookie first: it's what tells Next.js this is per-request work, before the database is touched.
  const token = (await cookies()).get(sessionCookie.name)?.value;
  // Checking a session compares its expiry with the clock, so it can't be part of a prerendered shell.
  await connection();
  return accountServices().accounts.authenticate(token);
});

/** Who's signed in, at whatever step of signing in; null when nobody is. Most code wants requireDashboardActor instead. */
export function currentSignIn(): Promise<SignedIn | null> {
  return signedIn();
}

/**
 * The person using the dashboard with every sign-in step done who meets
 * `requirement`, or null. Route handlers answer 401 for anyone else.
 */
export async function currentDashboardActor(requirement: DashboardRequirement): Promise<Actor | null> {
  const access = dashboardAccess(await signedIn(), requirement, clock.now());
  return access.status === "allowed" ? access.actor : null;
}

/** The path this request asked for (set by the proxy, never by the browser). */
async function requestedPath(): Promise<string> {
  return safeAdminDestination((await headers()).get(requestedPathHeader));
}

/** The page for each step of signing in still to take. */
const signInStepPaths: Record<SignInStep, string> = {
  mfa: adminPaths.mfa,
  "change-password": adminPaths.changePassword,
  "mfa-setup": adminPaths.mfaSetup,
};

/** Where a page sends someone it can't show: sign in, then come back to the page they asked for. */
async function toSignIn(): Promise<never> {
  redirect(signInPath(await requestedPath()));
}

/**
 * The person using a part of the dashboard that asks `requirement`, or a
 * redirect to the step they must take first: sign in, enter their code,
 * choose a password, set up an authenticator, or confirm their password
 * and code again. Someone whose role lacks the permission goes to the
 * dashboard's home with a notice.
 */
export async function requireDashboardActor(requirement: DashboardRequirement): Promise<Actor> {
  const access = dashboardAccess(await signedIn(), requirement, clock.now());
  switch (access.status) {
    case "allowed":
      return access.actor;
    case "signed-out":
      return toSignIn();
    case "sign-in-unfinished":
      return redirect(signInStepPaths[access.step]);
    case "not-allowed":
      return redirect(`${adminPaths.home}?notice=not-allowed`);
    case "step-up-due":
      return redirect(`${adminPaths.stepUp}?${new URLSearchParams({ next: await requestedPath() })}`);
  }
}

/** Whoever is signed in, at any step (for the sign-in step pages). Anyone else goes to sign in. */
export async function requireSignIn(): Promise<SignedIn> {
  return (await signedIn()) ?? toSignIn();
}

/** This browser's session token, for actions on the session itself. */
export async function currentSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(sessionCookie.name)?.value;
}

/** A short description of this browser, for the session list. */
export async function currentDevice(): Promise<string> {
  return describeDevice((await headers()).get("user-agent"));
}

/** Gives this browser its session. Only server actions and route handlers can set cookies. */
export async function setSessionCookie(session: NewSession): Promise<void> {
  (await cookies()).set(sessionCookie.name, session.token, sessionCookieOptions(session.expiresAt));
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).set(sessionCookie.name, "", clearedSessionCookieOptions());
}
