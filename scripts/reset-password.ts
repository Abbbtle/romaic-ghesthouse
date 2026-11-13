/**
 * Break-glass access, for when an owner has lost their password, their
 * authenticator and their recovery codes (roles.md, "Owner recovery"):
 *
 *   npm run admin:reset-password -- --email owner@example.com --operator "Weberu: A. Person" --reason "Owner's written request, 12 Nov"
 *
 * Run it only on the account holder's written request, under the written
 * infrastructure access policy: having the database is the only permission
 * it checks. It gives the account a temporary password (printed once, here,
 * valid for 72 hours), removes its authenticator and recovery codes, signs
 * it out everywhere, writes an audit entry naming the operator and reason,
 * and emails the account's address that it happened. The owner then chooses
 * a password and sets up a new authenticator at their next sign-in.
 *
 * It works on whatever database the shell, .env.local or .env points at:
 * DATABASE_URL_UNPOOLED, then DATABASE_URL, then POSTGRES_URL_NON_POOLING and
 * POSTGRES_URL, else the local PGlite (stop `next dev` first).
 */
import { parseArgs } from "node:util";
import { openDatabase } from "../src/adapters/postgres/database";
import { migrations } from "../src/adapters/postgres/migrations/registry";
import { businessName, recoveryService } from "../src/server/accounts";
import { env, loadEnvFiles } from "../src/server/env";
import { emailSenderFor, failureReason, scriptDriver } from "../src/server/infrastructure";

const usage = 'Usage: npm run admin:reset-password -- --email someone@example.com --operator "Your name" --reason "Why, and who asked in writing"';

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { email: { type: "string" }, operator: { type: "string" }, reason: { type: "string" } } });
  const email = values.email?.trim();
  const operator = values.operator?.trim();
  const reason = values.reason?.trim();
  if (!email || !operator || !reason) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }

  loadEnvFiles();
  const { driver, target } = scriptDriver();
  const db = openDatabase(driver, { migrations });
  try {
    const result = await recoveryService(db).resetAccess(email, { operator, reason });
    if (result.status === "not-found") {
      console.error(`No dashboard account uses ${email} (${target}).`);
      process.exitCode = 1;
      return;
    }
    const sender = emailSenderFor(env);
    const notified = sender
      ? await sender.send({
          to: result.email,
          subject: `Your ${businessName} dashboard access was reset`,
          text: [
            `Hi ${result.name},`,
            "",
            `Your dashboard password and authenticator were reset by ${operator}.`,
            `Reason given: ${reason}`,
            "",
            "You'll choose a new password and set up your authenticator app again when you next sign in.",
            "If you didn't ask for this, contact Weberu straight away.",
          ].join("\n"),
        })
      : { ok: false as const, reason: "email isn't configured" };
    console.log(
      [
        `Reset access for ${result.name} (${result.email}, ${result.role}, ${target}).`,
        "",
        `  Temporary password: ${result.temporaryPassword}`,
        `  Expires: ${result.expiresAt.toISOString()}`,
        "",
        "Share it privately. Every session is signed out; they'll choose a password and set up an authenticator at their next sign-in.",
        notified.ok ? "They've been emailed that this happened." : `They could NOT be emailed (${notified.reason}): tell them yourself.`,
        "The reset is recorded in the audit log.",
      ].join("\n"),
    );
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  console.error(`Access wasn't reset: ${failureReason(error)}`);
  process.exitCode = 1;
});
