import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { bankAccountPath } from "@/components/admin/bank/bank-paths";
import { ImportStatement } from "@/components/admin/bank/import-statement";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { maskedNumber } from "@/lib/bookkeeping/bank";
import { requireDashboardActor } from "@/server/admin-session";
import { bankService } from "@/server/bookkeeping";
import { importStatement } from "../../actions";

export const metadata: Metadata = { title: "Import a statement" };

/**
 * Importing a statement into one account (Pattern: form): the file, the
 * columns (asked for on the first import, used again after), a preview,
 * then Import. The owner's alone (bank:manage).
 */
export default async function ImportStatementPage({ params }: PageProps<"/admin/books/bank/[id]/import">) {
  const actor = await requireDashboardActor({ permission: "bank:manage" });
  const { id } = await params;
  const detail = await bankService().account(actor, id, { status: "unmatched", limit: 1 });
  if (!detail) notFound();
  const { account } = detail;

  return (
    <>
      <PageHeader
        title="Import a statement"
        description={`Into ${account.name}, ${account.bankName} ${maskedNumber(account.accountNumberLast4)}. Lines already imported are left alone, so an overlapping statement is fine.`}
        back={{ href: bankAccountPath(account.id), label: account.name }}
      />
      <div className="max-w-admin">
        <Panel>
          <ImportStatement accountId={account.id} savedMapping={account.mapping} action={importStatement} />
        </Panel>
      </div>
    </>
  );
}
