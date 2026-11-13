import { adminRoutes } from "../admin-routes";

export const bankPath = `${adminRoutes.books}/bank`;

export function bankAccountPath(accountId: string): string {
  return `${bankPath}/${encodeURIComponent(accountId)}`;
}

export function bankLinePath(accountId: string, lineId: string): string {
  return `${bankAccountPath(accountId)}/lines/${encodeURIComponent(lineId)}`;
}
