import { adminRoutes } from "../admin-routes";

/** Where the Privacy pages are. */
export const privacyPaths = {
  overview: adminRoutes.privacy,
  requests: `${adminRoutes.privacy}/requests`,
  guests: `${adminRoutes.privacy}/guests`,
  breaches: `${adminRoutes.privacy}/breaches`,
  procedure: `${adminRoutes.privacy}/procedure`,
  retention: `${adminRoutes.privacy}/retention`,
} as const;

export const privacyRequestPath = (id: string) => `${privacyPaths.requests}/${encodeURIComponent(id)}`;
export const privacyGuestPath = (id: string, requestId?: string | null) =>
  `${privacyPaths.guests}/${encodeURIComponent(id)}${requestId ? `?request=${encodeURIComponent(requestId)}` : ""}`;
export const privacyGuestExportPath = (id: string) => `${privacyPaths.guests}/${encodeURIComponent(id)}/export`;
export const breachPath = (id: string) => `${privacyPaths.breaches}/${encodeURIComponent(id)}`;
