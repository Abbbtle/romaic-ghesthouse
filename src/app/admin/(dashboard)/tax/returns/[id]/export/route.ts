import { type NextRequest } from "next/server";
import { can } from "@/lib/accounts/access";
import { routeDashboardActor } from "@/server/admin-session";
import { exportResponse, taxService } from "@/server/tax";

/**
 * A return's export pack as a CSV download: the figures, the rates and dates
 * used, and every journal behind them. Owner only (tax:manage and
 * finance:export): anyone else gets 401 or 404, never a hint the return
 * exists.
 */
export async function GET(_request: NextRequest, { params }: RouteContext<"/admin/tax/returns/[id]/export">): Promise<Response> {
  // Exports ask for the password and code again if they weren't entered in the last 15 minutes (roles.md, step-up).
  const access = await routeDashboardActor({ permission: "finance:export", stepUp: true });
  if ("response" in access) return access.response;
  const { actor } = access;
  const noStore = { "Cache-Control": "private, no-store", "Content-Type": "text/plain; charset=utf-8" };
  if (!can(actor, "tax:manage") || !can(actor, "finance:export")) return new Response("Not found", { status: 404, headers: noStore });
  const { id } = await params;
  return exportResponse(await taxService().exportReturn(actor, id));
}
