import type { NewTaxParameter, TaxParameter } from "../parameters";
import type { EmployeeRecord, PayrollRun } from "../payroll";
import type { PayrollStore, TaxStore } from "../ports";
import type { RegistrationRecord } from "../registrations";
import type { TaxReturn } from "../returns";

/**
 * Tax and payroll in memory, for tests, keeping the Postgres stores' rules
 * (./store-contract.ts checks both): parameters and registrations are only
 * ever added to, a return moves draft → reviewed → filed and only a draft
 * can be discarded, and a recorded run is only ever voided.
 */

const copy = <T>(value: T): T => structuredClone(value);

export function createMemoryTaxStore(seed: readonly TaxParameter[] = []): TaxStore {
  const parameters: TaxParameter[] = seed.map(copy);
  const registrations: RegistrationRecord[] = [];
  const returns = new Map<string, TaxReturn>();
  const newestFirst = (a: TaxReturn, b: TaxReturn) => b.periodEnd.localeCompare(a.periodEnd) || b.createdAt.getTime() - a.createdAt.getTime();

  return {
    async parameters() {
      return parameters.map(copy).sort((a, b) => a.code.localeCompare(b.code) || a.version - b.version);
    },

    async addParameter(parameter: NewTaxParameter) {
      if ((parameter.status === "verified") !== (parameter.value !== null)) return { status: "invalid", reason: "A verified version needs a value; an unverified one has none." };
      const version = Math.max(0, ...parameters.filter((existing) => existing.code === parameter.code).map((existing) => existing.version)) + 1;
      parameters.push(copy({ ...parameter, version }));
      return { status: "added", version };
    },

    async registrations() {
      return registrations.map(copy).sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
    },

    async recordRegistration(record) {
      registrations.push(copy(record));
    },

    async returns() {
      return [...returns.values()].map(copy).sort(newestFirst);
    },

    async taxReturn(id) {
      const found = returns.get(id);
      return found ? copy(found) : null;
    },

    async returnFor(kind, periodStart, periodEnd) {
      const found = [...returns.values()].find((candidate) => candidate.kind === kind && candidate.periodStart === periodStart && candidate.periodEnd === periodEnd);
      return found ? copy(found) : null;
    },

    async createReturn(draft) {
      if ([...returns.values()].some((candidate) => candidate.kind === draft.kind && candidate.periodStart === draft.periodStart && candidate.periodEnd === draft.periodEnd)) return "exists";
      returns.set(draft.id, copy(draft));
      return "created";
    },

    async refreshDraft(id, refresh) {
      const found = returns.get(id);
      if (!found || found.status !== "draft") return false;
      returns.set(id, { ...found, ...copy(refresh) });
      return true;
    },

    async markReviewed(id, at, by) {
      const found = returns.get(id);
      if (!found || found.status !== "draft") return false;
      returns.set(id, { ...found, status: "reviewed", reviewedAt: new Date(at), reviewedBy: by });
      return true;
    },

    async backToDraft(id) {
      const found = returns.get(id);
      if (!found || found.status !== "reviewed") return false;
      returns.set(id, { ...found, status: "draft", reviewedAt: null, reviewedBy: null });
      return true;
    },

    async markFiled(id, filing) {
      const found = returns.get(id);
      if (!found || found.status !== "reviewed") return false;
      returns.set(id, { ...found, status: "filed", ...copy(filing) });
      return true;
    },

    async discardDraft(id) {
      const found = returns.get(id);
      if (!found || found.status !== "draft") return false;
      returns.delete(id);
      return true;
    },
  };
}

export function createMemoryPayrollStore(): PayrollStore {
  const employees = new Map<string, EmployeeRecord>();
  const runs = new Map<string, PayrollRun>();

  return {
    async employees() {
      return [...employees.values()].map(copy).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    },

    async employee(id) {
      const found = employees.get(id);
      return found ? copy(found) : null;
    },

    async addEmployee(employee) {
      if (employees.has(employee.id)) throw new Error("An employee with this id exists.");
      employees.set(employee.id, copy(employee));
    },

    async updateEmployee(employee) {
      const found = employees.get(employee.id);
      if (!found) return false;
      employees.set(employee.id, { ...copy(employee), createdAt: found.createdAt, createdBy: found.createdBy });
      return true;
    },

    async runs(filter) {
      return [...runs.values()]
        .filter((run) => (!filter.period || run.period === filter.period) && (!filter.employeeId || run.employeeId === filter.employeeId))
        .map(copy)
        .sort((a, b) => b.period.localeCompare(a.period) || b.recordedAt.getTime() - a.recordedAt.getTime());
    },

    async run(id) {
      const found = runs.get(id);
      return found ? copy(found) : null;
    },

    async recordRun(run) {
      if (!employees.has(run.employeeId)) throw new Error("No such employee.");
      if ([...runs.values()].some((existing) => existing.employeeId === run.employeeId && existing.period === run.period && existing.voidedAt === null)) return { status: "duplicate" };
      runs.set(run.id, copy(run));
      return { status: "recorded" };
    },

    async voidRun(id, at, reason, reversalJournalId) {
      const found = runs.get(id);
      if (!found || found.voidedAt) return false;
      runs.set(id, { ...found, voidedAt: new Date(at), voidReason: reason, reversalJournalId });
      return true;
    },
  };
}
