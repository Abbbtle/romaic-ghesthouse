import { type NextRequest } from "next/server";
import { routeDashboardActor } from "@/server/admin-session";
import { guestExportResponse, privacyService } from "@/server/privacy";

/**
 * Everything held about a guest as a CSV download, for an access request.
 * Owner only (privacy:requests), and like every export of personal data it
 * asks for the password and code again unless they were entered in the last
 * 15 minutes (roles.md, step-up). Anyone else gets 401 or 403; a guest that
 * doesn't exist, 404. Each download is in the activity log.
 */
export async function GET(_request: NextRequest, { params }: RouteContext<"/admin/privacy/guests/[id]/export">): Promise<Response> {
  const access = await routeDashboardActor({ permission: "privacy:requests", stepUp: true });
  if ("response" in access) return access.response;
  const { id } = await params;
  return guestExportResponse(await privacyService().exportGuest(access.actor, id));
}
