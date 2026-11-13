import type { Metadata } from "next";
import { EmptyState } from "@/components/admin/empty-state";
import { expensesPath } from "@/components/admin/expenses/expense-list";
import { SupplierSheet } from "@/components/admin/expenses/supplier-sheet";
import { List } from "@/components/admin/list";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { requireDashboardActor } from "@/server/admin-session";
import { expenseService } from "@/server/bookkeeping";
import { addSupplier, changeSupplier } from "../actions";

export const metadata: Metadata = { title: "Suppliers" };

/**
 * Who expenses are paid to (Pattern: settings rows): one row each, with its
 * notes, changed in a slide-over. Suppliers are never deleted; their
 * expenses keep them. The owner's alone (expenses:manage).
 */
export default async function SuppliersPage() {
  const actor = await requireDashboardActor({ permission: "expenses:manage" });
  const suppliers = await expenseService().suppliers(actor);

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="The shops, businesses and people you pay. They're added as you record expenses, or here."
        back={{ href: expensesPath, label: "Expenses" }}
        actions={<SupplierSheet action={addSupplier} />}
      />
      <div className="max-w-admin">
        {suppliers.length > 0 ? (
          <Panel flush>
            <List label="Suppliers">
              {suppliers.map((supplier) => (
                <li key={supplier.id} className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 lg:px-5">
                  <span className="grid min-w-0 gap-0.5">
                    <span className="font-bold break-words text-ink">{supplier.name}</span>
                    {supplier.notes && <span className="text-sm whitespace-pre-line text-fg-2">{supplier.notes}</span>}
                  </span>
                  <SupplierSheet action={changeSupplier} supplier={{ id: supplier.id, name: supplier.name, notes: supplier.notes }} />
                </li>
              ))}
            </List>
          </Panel>
        ) : (
          <EmptyState title="No suppliers yet">Each expense you record adds who it was paid to. You can add one here first, with notes like their account number with you.</EmptyState>
        )}
      </div>
    </>
  );
}
