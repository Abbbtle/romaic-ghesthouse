import { Tabs } from "../tabs";
import { taxPaths } from "./tax-paths";

/** The Tax pages. All are the owner's (tax:manage; payroll:manage for Payroll), and every page checks again. */
export const taxPages = {
  overview: { href: taxPaths.overview, label: "Overview" },
  returns: { href: taxPaths.returns, label: "Returns" },
  payroll: { href: taxPaths.payroll, label: "Payroll" },
  registrations: { href: taxPaths.registrations, label: "Registrations" },
  parameters: { href: taxPaths.parameters, label: "Rates and dates" },
} as const;

export type TaxPage = keyof typeof taxPages;

export function TaxTabs({ current }: { current: TaxPage }) {
  return <Tabs label="Tax" items={Object.values(taxPages)} current={taxPages[current].href} className="mb-5" />;
}
