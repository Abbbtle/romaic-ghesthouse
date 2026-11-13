import type { IsoDate } from "@/lib/format/zoned-time";
import type { Actor } from "@/lib/kernel/actor";
import type { ChangeResult } from "@/lib/kernel/result";
import type { LedgerAccount } from "@/lib/ledger/accounts";
import type { Journal, JournalDraft, Period } from "@/lib/ledger/journals";
import type { SystemPostResult } from "@/lib/ledger/ledger-service";
import type { AccountSums } from "@/lib/ledger/ports";
import type { NewTaxParameter, TaxParameter } from "./parameters";
import type { EmployeeRecord, PayrollRun } from "./payroll";
import type { RegistrationRecord } from "./registrations";
import type { ReturnFigures, ReturnKind, TaxReturn, UsedParameter } from "./returns";

/**
 * What tax and payroll need from the outside world. Adapters implement the
 * stores (Postgres; in-memory ones in ./testing); src/server wires the
 * ledger, the vault, private files and permissions in.
 */

export type ParameterAdding = { status: "added"; version: number } | { status: "invalid"; reason: string };

/** A return's filing, as recorded. */
export type ReturnFiling = { filedOn: IsoDate; filedAt: Date; filedBy: string; proofFileId: string; submissionReference: string | null };

/** A draft's figures again, when it's refreshed. */
export type ReturnRefresh = { figures: ReturnFigures; parameters: UsedParameter[]; dueOn: IsoDate | null; label: string; preparedAt: Date; preparedBy: string };

/**
 * Parameters (append-only: a change is a new version), registrations
 * (append-only: the latest is current) and returns. In Postgres, filed
 * returns can't be deleted or changed, and a reviewed one's figures can't
 * change, whatever calls the database.
 */
export interface TaxStore {
  parameters(): Promise<TaxParameter[]>;
  /** Stores a new version of a parameter, numbered after the last for its code. */
  addParameter(parameter: NewTaxParameter): Promise<ParameterAdding>;

  /** Every registration record, oldest first. */
  registrations(): Promise<RegistrationRecord[]>;
  recordRegistration(record: RegistrationRecord): Promise<void>;

  /** Newest period first. */
  returns(): Promise<TaxReturn[]>;
  taxReturn(id: string): Promise<TaxReturn | null>;
  returnFor(kind: ReturnKind, periodStart: IsoDate, periodEnd: IsoDate): Promise<TaxReturn | null>;
  /** Stores a new draft; "exists" when that kind and period already has a return. */
  createReturn(draft: TaxReturn): Promise<"created" | "exists">;
  /** Replaces a draft's figures; false unless it's a draft. */
  refreshDraft(id: string, refresh: ReturnRefresh): Promise<boolean>;
  /** draft → reviewed; false unless it was a draft. */
  markReviewed(id: string, at: Date, by: string): Promise<boolean>;
  /** reviewed → draft; false unless it was reviewed. */
  backToDraft(id: string): Promise<boolean>;
  /** reviewed → filed; false unless it was reviewed. */
  markFiled(id: string, filing: ReturnFiling): Promise<boolean>;
  /** Removes a draft; false unless it's a draft (reviewed and filed returns stay). */
  discardDraft(id: string): Promise<boolean>;
}

export type RunRecording = { status: "recorded" } | { status: "duplicate" };

/** Employees and their pay. Recorded runs are never deleted: a mistake is voided, with its reason. */
export interface PayrollStore {
  employees(): Promise<EmployeeRecord[]>;
  employee(id: string): Promise<EmployeeRecord | null>;
  addEmployee(employee: EmployeeRecord): Promise<void>;
  /** Saves an employee's details; false when there's no such employee. */
  updateEmployee(employee: EmployeeRecord): Promise<boolean>;

  /** Newest month first. */
  runs(filter: { period?: string; employeeId?: string }): Promise<PayrollRun[]>;
  run(id: string): Promise<PayrollRun | null>;
  /** "duplicate" when the employee already has a run for that month that isn't voided. */
  recordRun(run: PayrollRun): Promise<RunRecording>;
  /** Voids a run that isn't voided yet; false otherwise. */
  voidRun(id: string, at: Date, reason: string, reversalJournalId: string | null): Promise<boolean>;
}

/**
 * The books as tax reads and writes them, wired to the ledger in
 * src/server. Reads are for the figures; locking months and posting payroll
 * go through the ledger's own rules.
 */
export interface TaxLedger {
  /** Every account in the chart, switched on or off. */
  accounts(actor: Actor): Promise<LedgerAccount[]>;
  sums(range: { from?: IsoDate; until?: IsoDate }): Promise<AccountSums[]>;
  /** Every journal dated in the range, oldest first. */
  journals(actor: Actor, range: { from: IsoDate; until: IsoDate }): Promise<Journal[]>;
  journal(actor: Actor, id: string): Promise<Journal | null>;
  /** The month the financial year ends (1–12) and the main bank account. */
  settings(actor: Actor): Promise<{ yearEndMonth: number; mainBank: string }>;
  isLocked(period: Period): Promise<boolean>;
  lockPeriod(actor: Actor, period: Period): Promise<ChangeResult>;
  post(draft: JournalDraft, actor: Actor): Promise<SystemPostResult>;
}

/** Encryption for reference and tax numbers, each bound to where it belongs. */
export interface TaxVault {
  seal(secret: string, context: string): string;
}

/** Whether a private file is a proof of submission the actor may open. */
export interface ProofFiles {
  isProofOfSubmission(actor: Actor, fileId: string): Promise<boolean>;
}

export type TaxPermission = "tax:manage" | "payroll:manage" | "finance:export";

export type TaxAccess = {
  can(actor: Actor, permission: TaxPermission): boolean;
  /** Throws the accounts core's NotAllowedError. */
  assertCan(actor: Actor, permission: TaxPermission): void;
};
