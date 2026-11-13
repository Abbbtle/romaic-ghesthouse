import type { NextRequest } from "next/server";
import { exportFileName, isReportKind, parseReportQuery, reportCsvRows, reportTableFor } from "@/components/admin/books/report-model";
import { can } from "@/lib/accounts/access";
import { csvDocument } from "@/lib/format/csv";
import { routeDashboardActor } from "@/server/admin-session";
import { ledgerService } from "@/server/ledger";
import { getSiteContent } from "@/server/site-content";

const plain = (message: string, status: number) =>
  new Response(message, { status, headers: { "Cache-Control": "private, no-store", "Content-Type": "text/plain; charset=utf-8" } });

/**
 * A statement as a CSV file, for the owner's accountant: /admin/books/export/<report>
 * with ?from=&until= (profit and loss, cash flow) or ?at= (balance sheet,
 * trial balance), the financial year so far when left out. Only someone
 * who may both read the books and take them out of the dashboard
 * (ledger:view and finance:export: the owner) gets it; anyone else gets
 * 401 or 403, and the file is never cached.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/admin/books/export/[report]">): Promise<Response> {
  // Exports ask for the password and code again if they weren't entered in the last 15 minutes (roles.md, step-up).
  const access = await routeDashboardActor({ permission: "finance:export", stepUp: true });
  if ("response" in access) return access.response;
  const { actor } = access;
  if (!can(actor, "ledger:view") || !can(actor, "finance:export")) return plain("Only the owner can download the books.", 403);
  const { report } = await params;
  if (!isReportKind(report)) return plain("There's no such report.", 404);
  const ledger = ledgerService();
  const settings = await ledger.settings(actor);
  const query = parseReportQuery(report, Object.fromEntries(request.nextUrl.searchParams), { today: ledger.today(), yearEndMonth: settings.yearEndMonth });
  if (!query) return plain("Choose dates like 2026-03-01, with the start before the end.", 400);
  const [table, content] = await Promise.all([reportTableFor(ledger, actor, query), getSiteContent()]);
  return new Response(csvDocument(reportCsvRows(table, query, content.site.businessName)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(query)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
