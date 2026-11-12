import { parseWith } from "@/lib/forms/parse";
import { formatCents } from "@/lib/format/money";
import { zonedToday } from "@/lib/format/zoned-time";
import type { Actor } from "@/lib/kernel/actor";
import type { AuditRecorder } from "@/lib/kernel/audit";
import type { Clock, IdGenerator } from "@/lib/kernel/ports";
import { done, refused, refusedWith, type ChangeResult } from "@/lib/kernel/result";
import { reversedLines } from "@/lib/ledger/journals";
import { checkPayroll, netPay, payMemo, payrollDraft, payrollSourceType, type Employee, type EmployeeRecord, type PayrollRun } from "./payroll";
import { lastDayOf } from "./periods";
import type { PayrollStore, TaxAccess, TaxLedger, TaxStore, TaxVault } from "./ports";
import { currentRegistrations, lastDigits, payrollOn, registeredOn } from "./registrations";
import { employeeSchema, payrollRunSchema, reasonSchema } from "./tax-input";

export type PayrollServiceDependencies = {
  store: PayrollStore;
  tax: Pick<TaxStore, "parameters" | "registrations">;
  ledger: TaxLedger;
  vault: TaxVault;
  clock: Clock;
  ids: IdGenerator;
  audit: AuditRecorder;
  access: TaxAccess;
  timeZone: string;
};

export type PayrollOverview = {
  /** Whether payroll is switched on (registered for PAYE, UIF or SDL). */
  on: boolean;
  employees: Employee[];
  /** The latest runs, newest month first. */
  runs: PayrollRun[];
  /** What to check on each run that isn't voided, by its id: UIF or SDL that differs from the verified parameters. */
  checks: Record<string, string[]>;
};

const reloadMessage = "Reload the page and try again.";

/** An employee without their sealed tax number. */
const publicEmployee = (employee: EmployeeRecord): Employee => ({
  id: employee.id,
  name: employee.name,
  startDate: employee.startDate,
  endDate: employee.endDate,
  active: employee.active,
  taxNumberLast4: employee.taxNumberLast4,
  createdAt: employee.createdAt,
  createdBy: employee.createdBy,
});

/**
 * Payroll as recorded: employees and each month's pay, posted to the books
 * (salaries, employer UIF and SDL, what's owed to SARS, net pay from the
 * main bank). Owner only (payroll:manage). Switched on once the owner
 * records a PAYE, UIF or SDL registration. A recorded run is never
 * deleted: a mistake is voided, which reverses its journal.
 */
export function createPayrollService(deps: PayrollServiceDependencies) {
  const { store, ledger, clock, ids, audit, access } = deps;
  const today = () => zonedToday(clock.now(), deps.timeZone);

  async function record(actor: Actor, action: string, target: { type: string; id: string }, summary: string) {
    await audit.record({ actor, category: "tax", action, target, summary });
  }

  async function registrations() {
    return currentRegistrations(await deps.tax.registrations());
  }

  return {
    async overview(actor: Actor): Promise<PayrollOverview> {
      access.assertCan(actor, "payroll:manage");
      const [current, employees, runs, parameters] = await Promise.all([registrations(), store.employees(), store.runs({}), deps.tax.parameters()]);
      const recent = runs.slice(0, 60);
      const checks = Object.fromEntries(
        recent.filter((run) => run.voidedAt === null).map((run) => [run.id, checkPayroll(parameters, run, registeredOn(current, "sdl", lastDayOf(run.period))).warnings]),
      );
      return { on: payrollOn(current), employees: employees.map(publicEmployee), runs: recent, checks };
    },

    async addEmployee(actor: Actor, input: unknown): Promise<ChangeResult<{ id: string }>> {
      access.assertCan(actor, "payroll:manage");
      if (!payrollOn(await registrations())) return refusedWith("Record the PAYE, UIF or SDL registration under Registrations before adding employees.");
      const parsed = parseWith(employeeSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const id = ids.newId();
      const { name, startDate, endDate, taxNumber } = parsed.value;
      const now = clock.now();
      await store.addEmployee({
        id,
        name,
        startDate,
        endDate,
        active: endDate === null || endDate >= today(),
        taxNumberLast4: taxNumber ? lastDigits(taxNumber) : null,
        taxNumberSealed: taxNumber ? deps.vault.seal(taxNumber, `employee-tax-number:${id}`) : null,
        createdAt: now,
        createdBy: actor.id,
      });
      await record(actor, "payroll.employee-added", { type: "employee", id }, `Added employee ${name}, starting ${startDate}`);
      return done({ id });
    },

    /** Saves an employee's details. A tax number left empty keeps the one on record; a new one replaces it. */
    async updateEmployee(actor: Actor, id: string, input: unknown): Promise<ChangeResult> {
      access.assertCan(actor, "payroll:manage");
      const parsed = parseWith(employeeSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const existing = await store.employee(id);
      if (!existing) return refusedWith(reloadMessage);
      const { name, startDate, endDate, taxNumber, active } = parsed.value;
      const saved = await store.updateEmployee({
        ...existing,
        name,
        startDate,
        endDate,
        active,
        taxNumberLast4: taxNumber ? lastDigits(taxNumber) : existing.taxNumberLast4,
        taxNumberSealed: taxNumber ? deps.vault.seal(taxNumber, `employee-tax-number:${id}`) : existing.taxNumberSealed,
      });
      if (!saved) return refusedWith(reloadMessage);
      await record(actor, "payroll.employee-saved", { type: "employee", id }, `Saved ${name}'s details${taxNumber ? " (new tax number)" : ""}`);
      return done();
    },

    async runs(actor: Actor, filter: { period?: string; employeeId?: string }): Promise<PayrollRun[]> {
      access.assertCan(actor, "payroll:manage");
      return store.runs(filter);
    },

    /**
     * Records a month's pay for an employee and posts it to the books. Net
     * pay must be gross less PAYE and the employee's UIF (left empty, it's
     * worked out). Saved with warnings when the UIF or SDL differs from the
     * verified parameters; refused only when the books can't post it.
     */
    async recordRun(actor: Actor, input: unknown): Promise<ChangeResult<{ id: string; warnings: string[] }>> {
      access.assertCan(actor, "payroll:manage");
      const current = await registrations();
      if (!payrollOn(current)) return refusedWith("Record the PAYE, UIF or SDL registration under Registrations before recording pay.");
      const parsed = parseWith(payrollRunSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const { employeeId, period, paidOn, gross, paye, uifEmployee, uifEmployer, sdl, net } = parsed.value;
      const employee = await store.employee(employeeId);
      if (!employee) return refused({ employeeId: "Choose the employee." });
      if (paidOn > today()) return refused({ paidOn: "Record pay once it's paid: choose today or an earlier day." });
      if (lastDayOf(period) < employee.startDate) return refused({ period: `${employee.name} started on ${employee.startDate}.` });
      const expectedNet = netPay({ grossCents: gross, payeCents: paye, uifEmployeeCents: uifEmployee });
      if (expectedNet < 0) return refused({ paye: "PAYE and the employee's UIF come to more than gross pay." });
      if (net !== null && net !== expectedNet) return refused({ net: `Net pay should be gross less PAYE and the employee's UIF: ${formatCents(expectedNet)}. Other deductions aren't recorded here.` });
      if ((await store.runs({ period, employeeId })).some((run) => run.voidedAt === null)) return refused({ period: `${employee.name}'s pay for that month is recorded already. Void it first to record it again.` });
      const amounts = { grossCents: gross, payeCents: paye, uifEmployeeCents: uifEmployee, uifEmployerCents: uifEmployer, sdlCents: sdl, netCents: expectedNet };
      const id = ids.newId();
      const { mainBank } = await ledger.settings(actor);
      const posted = await ledger.post(payrollDraft({ id, period, paidOn, ...amounts }, employee.name, mainBank), actor);
      if (posted.status === "refused") return refusedWith(`The books couldn't post this pay: ${posted.problem}`);
      const run: PayrollRun = { id, employeeId, period, paidOn, ...amounts, journalId: posted.journal.id, reversalJournalId: null, recordedAt: clock.now(), recordedBy: actor.id, voidedAt: null, voidReason: null };
      if ((await store.recordRun(run)).status === "duplicate") return refused({ period: `${employee.name}'s pay for that month is recorded already.` });
      const { warnings } = checkPayroll(await deps.tax.parameters(), run, registeredOn(current, "sdl", lastDayOf(period)));
      await record(actor, "payroll.run-recorded", { type: "payroll-run", id }, `Recorded ${employee.name}'s pay for ${period}: ${formatCents(gross)} gross`);
      return done({ id, warnings });
    },

    /** Voids a recorded run: its journal is reversed (dated today) and it stays on record, crossed out, with the reason. */
    async voidRun(actor: Actor, id: string, input: unknown): Promise<ChangeResult> {
      access.assertCan(actor, "payroll:manage");
      const parsed = parseWith(reasonSchema, input);
      if (!parsed.ok) return refused(parsed.errors);
      const run = await store.run(id);
      if (!run) return refusedWith(reloadMessage);
      if (run.voidedAt) return refusedWith("That pay is voided already.");
      const employee = await store.employee(run.employeeId);
      let reversalJournalId: string | null = null;
      if (run.journalId) {
        // Undo the journal as it was posted, even if the main bank has changed since.
        const original = await ledger.journal(actor, run.journalId);
        const lines = original?.lines ?? payrollDraft(run, employee?.name ?? "employee", (await ledger.settings(actor)).mainBank).lines;
        const memo = original?.memo ?? payMemo(run.period);
        const reversal = await ledger.post(
          { date: today(), memo: `Reverses "${memo}": ${parsed.value.reason}`, source: { type: payrollSourceType, id, part: "voided" }, reversalOf: run.journalId, lines: reversedLines(lines) },
          actor,
        );
        if (reversal.status === "refused") return refusedWith(`The books couldn't reverse this pay: ${reversal.problem}`);
        reversalJournalId = reversal.journal.id;
      }
      if (!(await store.voidRun(id, clock.now(), parsed.value.reason, reversalJournalId))) return refusedWith("That pay is voided already.");
      await record(actor, "payroll.run-voided", { type: "payroll-run", id }, `Voided ${employee?.name ?? "an employee"}'s pay for ${run.period}: ${parsed.value.reason}`);
      return done();
    },
  };
}

export type PayrollService = ReturnType<typeof createPayrollService>;
