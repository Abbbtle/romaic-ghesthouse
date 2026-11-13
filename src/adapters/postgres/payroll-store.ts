import "server-only";
import type { EmployeeRecord, PayrollRun } from "@/lib/tax/payroll";
import type { PayrollStore, RunRecording } from "@/lib/tax/ports";
import type { Database } from "./database";
import { UniqueViolationError } from "./errors";
import { isUuid } from "./uuid";

type EmployeeRow = {
  id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  active: boolean;
  tax_number_sealed: string | null;
  tax_number_last4: string | null;
  created_at: Date;
  created_by: string | null;
};

type RunRow = {
  id: string;
  employee_id: string;
  period: string;
  paid_on: string;
  gross_cents: number | string;
  paye_cents: number | string;
  uif_employee_cents: number | string;
  uif_employer_cents: number | string;
  sdl_cents: number | string;
  net_cents: number | string;
  journal_id: string | null;
  reversal_journal_id: string | null;
  recorded_at: Date;
  recorded_by: string | null;
  voided_at: Date | null;
  void_reason: string | null;
};

const employeeColumns = "id, name, start_date, end_date, active, tax_number_sealed, tax_number_last4, created_at, created_by";
const runColumns =
  "id, employee_id, period, paid_on, gross_cents, paye_cents, uif_employee_cents, uif_employer_cents, sdl_cents, net_cents, journal_id, reversal_journal_id, recorded_at, recorded_by, voided_at, void_reason";

function employeeOf(row: EmployeeRow): EmployeeRecord {
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    active: row.active,
    taxNumberSealed: row.tax_number_sealed,
    taxNumberLast4: row.tax_number_last4,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

function runOf(row: RunRow): PayrollRun {
  return {
    id: row.id,
    employeeId: row.employee_id,
    period: row.period,
    paidOn: row.paid_on,
    grossCents: Number(row.gross_cents),
    payeCents: Number(row.paye_cents),
    uifEmployeeCents: Number(row.uif_employee_cents),
    uifEmployerCents: Number(row.uif_employer_cents),
    sdlCents: Number(row.sdl_cents),
    netCents: Number(row.net_cents),
    journalId: row.journal_id,
    reversalJournalId: row.reversal_journal_id,
    recordedAt: row.recorded_at,
    recordedBy: row.recorded_by,
    voidedAt: row.voided_at,
    voidReason: row.void_reason,
  };
}

/** Employees and payroll runs in Postgres (migration 360): runs are never deleted or changed, only voided once. */
export function createPostgresPayrollStore(db: Database): PayrollStore {
  return {
    async employees() {
      const rows = await db.all<EmployeeRow>(`select ${employeeColumns} from app.employees order by name, id`);
      return rows.map(employeeOf);
    },

    async employee(id) {
      if (!isUuid(id)) return null;
      const row = await db.get<EmployeeRow>(`select ${employeeColumns} from app.employees where id = :id`, { id });
      return row ? employeeOf(row) : null;
    },

    async addEmployee(employee) {
      if (!isUuid(employee.id)) throw new Error("An employee's id must be a UUID.");
      await db.run(
        `insert into app.employees (${employeeColumns}, updated_at)
         values (:id, :name, :startDate::date, :endDate::date, :active, :taxNumberSealed, :taxNumberLast4, :createdAt, :createdBy, :createdAt)`,
        {
          id: employee.id,
          name: employee.name,
          startDate: employee.startDate,
          endDate: employee.endDate,
          active: employee.active,
          taxNumberSealed: employee.taxNumberSealed,
          taxNumberLast4: employee.taxNumberLast4,
          createdAt: employee.createdAt,
          createdBy: employee.createdBy,
        },
      );
    },

    async updateEmployee(employee) {
      if (!isUuid(employee.id)) return false;
      const { changes } = await db.run(
        `update app.employees set name = :name, start_date = :startDate::date, end_date = :endDate::date, active = :active,
           tax_number_sealed = :taxNumberSealed, tax_number_last4 = :taxNumberLast4, updated_at = now()
         where id = :id`,
        {
          id: employee.id,
          name: employee.name,
          startDate: employee.startDate,
          endDate: employee.endDate,
          active: employee.active,
          taxNumberSealed: employee.taxNumberSealed,
          taxNumberLast4: employee.taxNumberLast4,
        },
      );
      return changes === 1;
    },

    async runs(filter) {
      const where = [filter.period ? "period = :period" : null, filter.employeeId ? "employee_id = :employeeId" : null].filter(Boolean).join(" and ") || "true";
      if (filter.employeeId && !isUuid(filter.employeeId)) return [];
      const params: Record<string, string> = {};
      if (filter.period) params.period = filter.period;
      if (filter.employeeId) params.employeeId = filter.employeeId;
      const rows = await db.all<RunRow>(`select ${runColumns} from app.payroll_runs where ${where} order by period desc, recorded_at desc, id`, params);
      return rows.map(runOf);
    },

    async run(id) {
      if (!isUuid(id)) return null;
      const row = await db.get<RunRow>(`select ${runColumns} from app.payroll_runs where id = :id`, { id });
      return row ? runOf(row) : null;
    },

    async recordRun(run): Promise<RunRecording> {
      if (!isUuid(run.id)) throw new Error("A payroll run's id must be a UUID.");
      try {
        await db.run(
          `insert into app.payroll_runs (${runColumns})
           values (:id, :employeeId, :period, :paidOn::date, :grossCents, :payeCents, :uifEmployeeCents, :uifEmployerCents, :sdlCents, :netCents,
                   :journalId, :reversalJournalId, :recordedAt, :recordedBy, :voidedAt, :voidReason)`,
          { ...run },
        );
        return { status: "recorded" };
      } catch (error) {
        if (error instanceof UniqueViolationError && error.constraint === "payroll_runs_one_per_month") return { status: "duplicate" };
        throw error;
      }
    },

    async voidRun(id, at, reason, reversalJournalId) {
      if (!isUuid(id)) return false;
      const { changes } = await db.run(
        "update app.payroll_runs set voided_at = :at, void_reason = :reason, reversal_journal_id = :reversalJournalId where id = :id and voided_at is null",
        { id, at, reason, reversalJournalId },
      );
      return changes === 1;
    },
  };
}
