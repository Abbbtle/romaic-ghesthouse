import type { MetadataRoute } from "next";
import { adminRoutes } from "./admin-routes";

/** Where the installable dashboard's web-app manifest is served (the proxy lets browsers fetch it without a session). */
export const adminManifestPath = "/admin/manifest.webmanifest";

/**
 * The dashboard's install icons: a gold frame on Midnight Navy (the brand
 * guide's colours; the logo itself waits for the client's files). A maskable
 * icon is cropped to a circle (or a phone's own shape) inside the middle 80%,
 * so its mark has more room around it.
 */
export const adminIcons = {
  "icon-192.png": { size: 192, padding: 0.18, purpose: "any" },
  "icon-512.png": { size: 512, padding: 0.18, purpose: "any" },
  "maskable-512.png": { size: 512, padding: 0.25, purpose: "maskable" },
} as const;

export type AdminIconName = keyof typeof adminIcons;

export function isAdminIconName(value: string): value is AdminIconName {
  return Object.hasOwn(adminIcons, value);
}

/**
 * The installable dashboard (design-spec §10, product-spec §9): added to a
 * phone's home screen it opens on Today, without the browser's bars, in the
 * dashboard's own colours.
 */
export function adminManifest(): MetadataRoute.Manifest {
  return {
    id: adminRoutes.today,
    name: "Romaic Guesthouse dashboard",
    short_name: "Romaic",
    description: "Romaic Guesthouse's bookings, website and business.",
    start_url: adminRoutes.today,
    scope: adminRoutes.today,
    display: "standalone",
    background_color: "#ECE8DD",
    theme_color: "#111D29",
    icons: Object.entries(adminIcons).map(([name, icon]) => ({
      src: `${adminManifestPath}/${name}`,
      sizes: `${icon.size}x${icon.size}`,
      type: "image/png",
      purpose: icon.purpose,
    })),
  };
}
