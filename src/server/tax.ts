import "server-only";
import { createPostgresPayrollStore } from "@/adapters/postgres/payroll-store";
import { createPostgresTaxStore } from "@/adapters/postgres/tax-store";
import { assertCan, can } from "@/lib/accounts/access";
import { businessTimeZone } from "@/lib/format/zoned-time";
import type { Actor } from "@/lib/kernel/actor";
import { taxLedgerFrom } from "@/lib/tax/ledger-port";
import { createPayrollService, type PayrollService } from "@/lib/tax/payroll-service";
import type { ProofFiles } from "@/lib/tax/ports";
import { createTaxService, type TaxService } from "@/lib/tax/tax-service";
import { auditRecorder } from "./audit";
import { clock, database, fieldCipher, ids } from "./infrastructure";
import { ledgerService } from "./ledger";
import { privateFileService } from "./media";

/**
 * Tax and payroll as the site uses them: parameters, registrations, returns,
 * employees and pay in Postgres; figures read from (and payroll posted to)
 * the ledger; reference and tax numbers sealed with DATA_ENCRYPTION_KEY,
 * each bound to its record; proof of submission kept as private files;
 * permissions from the accounts core (owner only); every change in the
 * audit log ("tax"), never with a reference or tax number in it.
 */

let tax: TaxService | null = null;
let payroll: PayrollService | null = null;

const vault = { seal: (secret: string, context: string) => fieldCipher().encrypt(secret, context) };

/** A proof of submission: a private file with that purpose, which the actor may open. */
const proofFiles: ProofFiles = {
  async isProofOfSubmission(actor: Actor, fileId: string) {
    const file = await privateFileService().open(actor, fileId);
    return file?.purpose === "proof-of-submission";
  },
};

export function taxService(): TaxService {
  tax ??= createTaxService({
    store: createPostgresTaxStore(database()),
    payroll: createPostgresPayrollStore(database()),
    ledger: taxLedgerFrom(ledgerService()),
    vault,
    proofFiles,
    clock,
    ids,
    audit: auditRecorder(),
    access: { can, assertCan },
    timeZone: businessTimeZone,
  });
  return tax;
}

export function payrollService(): PayrollService {
  payroll ??= createPayrollService({
    store: createPostgresPayrollStore(database()),
    tax: createPostgresTaxStore(database()),
    ledger: taxLedgerFrom(ledgerService()),
    vault,
    clock,
    ids,
    audit: auditRecorder(),
    access: { can, assertCan },
    timeZone: businessTimeZone,
  });
  return payroll;
}

/** The response for a return's export pack: a CSV download, never cached or shown as a page. */
export function exportResponse(pack: { fileName: string; csv: string } | null): Response {
  const noStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (!pack) return new Response("Not found", { status: 404, headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(`﻿${pack.csv}`, {
    headers: { ...noStore, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${pack.fileName}"` },
  });
}
