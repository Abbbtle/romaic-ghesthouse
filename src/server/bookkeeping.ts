import "server-only";
import { sha256Hex } from "@/adapters/crypto/tokens";
import { createPostgresBankStore } from "@/adapters/postgres/bank-store";
import { createPostgresExpenseStore } from "@/adapters/postgres/expense-store";
import { createPostgresLedgerStore } from "@/adapters/postgres/ledger-store";
import { assertCan, can } from "@/lib/accounts/access";
import { createBankService, type BankService } from "@/lib/bookkeeping/bank-service";
import { booksLedgerOf } from "@/lib/bookkeeping/books-ledger";
import { createExpenseService, type ExpenseService } from "@/lib/bookkeeping/expense-service";
import type { BooksLedger } from "@/lib/bookkeeping/ports";
import { auditRecorder } from "./audit";
import { clock, database, fieldCipher, ids } from "./infrastructure";
import { ledgerService } from "./ledger";

/**
 * Bookkeeping as the site uses it: suppliers, expenses, bank accounts,
 * statement imports and their lines in Postgres; journals posted through
 * the ledger service (and read from its store); bank account numbers sealed
 * with DATA_ENCRYPTION_KEY; permissions from the accounts core (the
 * owner's: expenses:manage, bank:manage); every change in the audit log
 * ("money"), never with a full account number in it.
 */

let expenses: ExpenseService | null = null;
let bank: BankService | null = null;

function booksLedger(): BooksLedger {
  return booksLedgerOf(ledgerService(), createPostgresLedgerStore(database()));
}

export function expenseService(): ExpenseService {
  expenses ??= createExpenseService({
    expenses: createPostgresExpenseStore(database()),
    bank: createPostgresBankStore(database()),
    ledger: booksLedger(),
    clock,
    ids,
    audit: auditRecorder(),
    access: { can, assertCan },
  });
  return expenses;
}

export function bankService(): BankService {
  bank ??= createBankService({
    bank: createPostgresBankStore(database()),
    ledger: booksLedger(),
    vault: { seal: (secret, context) => fieldCipher().encrypt(secret, context) },
    sha256: sha256Hex,
    clock,
    ids,
    audit: auditRecorder(),
    access: { can, assertCan },
  });
  return bank;
}
