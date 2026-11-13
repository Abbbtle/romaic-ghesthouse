import { accountKindNames, accountKinds, type LedgerAccount } from "@/lib/ledger/accounts";

/** Accounts under their kind ("Assets", "Expenses"), in chart order, for grouped choices. */
export type AccountGroup = { label: string; accounts: { code: string; name: string }[] };

export function accountGroups(chart: readonly LedgerAccount[], options: { activeOnly: boolean }): AccountGroup[] {
  return accountKinds
    .map((kind) => ({
      label: accountKindNames[kind],
      accounts: chart
        .filter((account) => account.kind === kind && (account.active || !options.activeOnly))
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((account) => ({ code: account.code, name: account.active ? account.name : `${account.name} (off)` })),
    }))
    .filter((group) => group.accounts.length > 0);
}
