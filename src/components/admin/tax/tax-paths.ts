import { adminRoutes } from "../admin-routes";

/** Where the Tax pages are. */
export const taxPaths = {
  overview: adminRoutes.tax,
  returns: `${adminRoutes.tax}/returns`,
  payroll: `${adminRoutes.tax}/payroll`,
  registrations: `${adminRoutes.tax}/registrations`,
  parameters: `${adminRoutes.tax}/parameters`,
} as const;

export const taxReturnPath = (id: string) => `${taxPaths.returns}/${id}`;
