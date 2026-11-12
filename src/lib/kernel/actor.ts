/**
 * Who is acting in the dashboard. Four roles (docs/planning/roles.md):
 * the owner runs the business and holds everything; admins are Weberu
 * agency staff who look after the site and never see finance data; sales
 * take and manage bookings; staff run the house day to day. Every core can
 * accept an Actor without depending on the accounts core.
 */

export const roles = ["owner", "admin", "sales", "staff"] as const;

export type Role = (typeof roles)[number];

export const roleNames: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  sales: "Sales",
  staff: "Staff",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (roles as readonly string[]).includes(value);
}

/** A signed-in dashboard user, as the cores see them. */
export type Actor = {
  id: string;
  role: Role;
  name: string;
};
