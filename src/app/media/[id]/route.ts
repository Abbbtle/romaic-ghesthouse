import { connection, type NextRequest } from "next/server";
import { imageResponse, mediaService } from "@/server/media";

/** An uploaded image, by id: served with a year's caching, since a stored image never changes (see src/server/media.ts). */
export async function GET(_request: NextRequest, { params }: RouteContext<"/media/[id]">): Promise<Response> {
  // Per request, never at build time: images arrive after the site is built.
  await connection();
  const { id } = await params;
  return imageResponse(await mediaService().get(id));
}
