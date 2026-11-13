import { ImageResponse } from "next/og";
import { createElement } from "react";
import { adminIcons, isAdminIconName } from "@/components/admin/admin-manifest";

/** Every icon the manifest lists, drawn at build time. */
export function generateStaticParams(): { icon: string }[] {
  return Object.keys(adminIcons).map((icon) => ({ icon }));
}

/** The dashboard's install icons (see adminIcons): a gold frame on Midnight Navy, as a PNG, until the logo files arrive. */
export async function GET(_request: Request, { params }: RouteContext<"/admin/manifest.webmanifest/[icon]">): Promise<Response> {
  const { icon } = await params;
  if (!isAdminIconName(icon)) {
    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  const { size, padding } = adminIcons[icon];
  const inset = Math.round(size * padding);
  const frame = Math.max(4, Math.round(size * 0.04));
  return new ImageResponse(
    createElement(
      "div",
      { style: { width: size, height: size, display: "flex", background: "#111D29", padding: inset } },
      createElement("div", { style: { flex: 1, display: "flex", border: `${frame}px solid #CBA959`, borderRadius: Math.round(size * 0.04) } }),
    ),
    { width: size, height: size },
  );
}
