import { type NextRequest } from "next/server";
import { anySignedInRole } from "@/lib/accounts/access";
import { currentDashboardActor } from "@/server/admin-session";
import { privateFileResponse, privateFileService } from "@/server/media";

/**
 * A private file, by id, for someone signed in whose role covers its purpose
 * (see src/lib/media/private-files.ts). Which permission that is depends on
 * the file, so the route admits any role and the private-file service
 * decides. Anyone else gets 401 or 404, never a hint that the file exists.
 */
export async function GET(_request: NextRequest, { params }: RouteContext<"/admin/files/[id]">): Promise<Response> {
  const actor = await currentDashboardActor(anySignedInRole);
  if (!actor) return new Response("Sign in first.", { status: 401, headers: { "Cache-Control": "private, no-store", "Content-Type": "text/plain; charset=utf-8" } });
  const { id } = await params;
  return privateFileResponse(await privateFileService().open(actor, id));
}
