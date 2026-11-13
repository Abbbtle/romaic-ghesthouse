import "server-only";
import { paymentSources, type Expense, type PaymentSource, type Supplier } from "@/lib/bookkeeping/expenses";
import type { ExpenseStore } from "@/lib/bookkeeping/ports";
import type { Database } from "./database";
import { UniqueViolationError } from "./errors";
import { isUuid } from "./uuid";

type SupplierRow = { id: string; name: string; notes: string | null; created_at: Date; created_by: string | null };

type ExpenseRow = {
  id: string;
  expense_date: string;
  supplier_id: string;
  account_code: string;
  amount_cents: string | number;
  description: string;
  paid_by: string;
  paid_from: string;
  bank_account_id: string | null;
  receipt_file_id: string | null;
  journal_id: string | null;
  recorded_by: string | null;
  created_at: Date;
  voided_at: Date | null;
  void_reason: string | null;
  voided_by: string | null;
  void_journal_id: string | null;
};

const supplierColumns = "id, name, notes, created_at, created_by";
const expenseColumns = `id, expense_date, supplier_id, account_code, amount_cents, description, paid_by, paid_from, bank_account_id, receipt_file_id,
  journal_id, recorded_by, created_at, voided_at, void_reason, voided_by, void_journal_id`;

/** How a name is compared, as the generated name_key column has it. */
const nameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

const supplierOf = (row: SupplierRow): Supplier => ({ id: row.id, name: row.name, notes: row.notes, createdAt: row.created_at, createdBy: row.created_by });

function expenseOf(row: ExpenseRow): Expense {
  return {
    id: row.id,
    date: row.expense_date,
    supplierId: row.supplier_id,
    accountCode: row.account_code,
    amountCents: Number(row.amount_cents),
    description: row.description,
    // The check constraint allows only the known values; anything else reads as the most cautious one.
    paidBy: (paymentSources as readonly string[]).includes(row.paid_by) ? (row.paid_by as PaymentSource) : "owner",
    paidFrom: row.paid_from,
    bankAccountId: row.bank_account_id,
    receiptFileId: row.receipt_file_id,
    journalId: row.journal_id,
    vatCents: null,
    recordedBy: row.recorded_by,
    createdAt: row.created_at,
    voidedAt: row.voided_at,
    voidReason: row.void_reason,
    voidedBy: row.voided_by,
    voidJournalId: row.void_journal_id,
  };
}

/** Suppliers and expenses in Postgres (./migrations/320-expenses.ts): never deleted, and what an expense says never changes. */
export function createPostgresExpenseStore(db: Database): ExpenseStore {
  return {
    async suppliers() {
      return (await db.all<SupplierRow>(`select ${supplierColumns} from app.suppliers order by name_key, id`)).map(supplierOf);
    },

    async supplier(id) {
      if (!isUuid(id)) return null;
      const row = await db.get<SupplierRow>(`select ${supplierColumns} from app.suppliers where id = :id`, { id });
      return row ? supplierOf(row) : null;
    },

    async supplierByName(name) {
      const row = await db.get<SupplierRow>(`select ${supplierColumns} from app.suppliers where name_key = :key`, { key: nameKey(name) });
      return row ? supplierOf(row) : null;
    },

    async addSupplier(supplier) {
      try {
        await db.run(`insert into app.suppliers (${supplierColumns}) values (:id, :name, :notes, :createdAt, :createdBy)`, {
          id: supplier.id,
          name: supplier.name,
          notes: supplier.notes,
          createdAt: supplier.createdAt,
          createdBy: supplier.createdBy,
        });
        return "added";
      } catch (error) {
        if (error instanceof UniqueViolationError && error.constraint === "suppliers_name_unique") return "name-taken";
        throw error;
      }
    },

    async changeSupplier(id, change) {
      if (!isUuid(id)) return "missing";
      try {
        const { changes } = await db.run("update app.suppliers set name = :name, notes = :notes where id = :id", { id, name: change.name, notes: change.notes });
        return changes === 1 ? "changed" : "missing";
      } catch (error) {
        if (error instanceof UniqueViolationError && error.constraint === "suppliers_name_unique") return "name-taken";
        throw error;
      }
    },

    async addExpense(expense) {
      await db.run(
        `insert into app.expenses (${expenseColumns}, vat_cents)
         values (:id, :date::date, :supplierId, :accountCode, :amountCents, :description, :paidBy, :paidFrom, :bankAccountId, :receiptFileId,
           :journalId, :recordedBy, :createdAt, :voidedAt, :voidReason, :voidedBy, :voidJournalId, null)`,
        {
          id: expense.id,
          date: expense.date,
          supplierId: expense.supplierId,
          accountCode: expense.accountCode,
          amountCents: expense.amountCents,
          description: expense.description,
          paidBy: expense.paidBy,
          paidFrom: expense.paidFrom,
          bankAccountId: expense.bankAccountId,
          receiptFileId: expense.receiptFileId,
          journalId: expense.journalId,
          recordedBy: expense.recordedBy,
          createdAt: expense.createdAt,
          voidedAt: expense.voidedAt,
          voidReason: expense.voidReason,
          voidedBy: expense.voidedBy,
          voidJournalId: expense.voidJournalId,
        },
      );
    },

    async expense(id) {
      if (!isUuid(id)) return null;
      const row = await db.get<ExpenseRow>(`select ${expenseColumns} from app.expenses where id = :id`, { id });
      return row ? expenseOf(row) : null;
    },

    async expenses(filter) {
      if (filter.supplierId !== undefined && !isUuid(filter.supplierId)) return [];
      const rows = await db.all<ExpenseRow>(
        `select ${expenseColumns} from app.expenses
         where (:from::date is null or expense_date >= :from::date)
           and (:until::date is null or expense_date <= :until::date)
           and (:supplierId::uuid is null or supplier_id = :supplierId::uuid)
           and (:accountCode::text is null or account_code = :accountCode::text)
         order by expense_date desc, created_at desc, id desc
         limit :limit`,
        { from: filter.from ?? null, until: filter.until ?? null, supplierId: filter.supplierId ?? null, accountCode: filter.accountCode ?? null, limit: filter.limit },
      );
      return rows.map(expenseOf);
    },

    async setJournal(id, journalId) {
      if (!isUuid(id)) return false;
      const { changes } = await db.run("update app.expenses set journal_id = :journalId where id = :id and journal_id is null", { id, journalId });
      return changes === 1;
    },

    async voidExpense(id, at, by, reason) {
      if (!isUuid(id)) return false;
      const { changes } = await db.run("update app.expenses set voided_at = :at, voided_by = :by, void_reason = :reason where id = :id and voided_at is null", { id, at, by, reason });
      return changes === 1;
    },

    async setVoidJournal(id, journalId) {
      if (!isUuid(id)) return false;
      const { changes } = await db.run("update app.expenses set void_journal_id = :journalId where id = :id and voided_at is not null and void_journal_id is null", { id, journalId });
      return changes === 1;
    },

    async attachReceipt(id, fileId) {
      if (!isUuid(id)) return false;
      const { changes } = await db.run("update app.expenses set receipt_file_id = :fileId where id = :id and receipt_file_id is null and voided_at is null", { id, fileId });
      return changes === 1;
    },
  };
}
