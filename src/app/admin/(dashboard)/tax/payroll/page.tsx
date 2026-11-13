import type { Metadata } from "next";
import { Users } from "lucide-react";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { StatusPill } from "@/components/admin/status-pill";
import { EmployeeSheet, PayrollRunForm, VoidRunButton } from "@/components/admin/tax/payroll-forms";
import { taxPaths } from "@/components/admin/tax/tax-paths";
import { TaxTabs } from "@/components/admin/tax/tax-tabs";
import { ButtonLink } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { formatDateShort, formatMonth } from "@/lib/format/date-time";
import { formatCents } from "@/lib/format/money";
import { payMonths } from "@/lib/tax/payroll";
import { maskedReference } from "@/lib/tax/registrations";
import { requireDashboardActor } from "@/server/admin-session";
import { payrollService, taxService } from "@/server/tax";
import { addEmployee, recordPayrollRun, updateEmployee, voidPayrollRun } from "../actions";

export const metadata: Metadata = { title: "Payroll" };

/**
 * Payroll as recorded (Pattern: list): employees, recording each month's
 * pay as the payslip shows it (posted to the books as it's saved), and the
 * pay recorded so far with anything to check. The app doesn't work out
 * PAYE. Owner only (payroll:manage); switched on by a PAYE, UIF or SDL
 * registration.
 */
export default async function PayrollPage() {
  const actor = await requireDashboardActor({ permission: "payroll:manage" });
  const { on, employees, runs, checks } = await payrollService().overview(actor);
  const today = taxService().today();
  // This month and the twelve before it, newest first; last month is the usual one to record.
  const months = payMonths(today).map((month) => ({ value: month, label: formatMonth(month) }));
  const lastMonth = months[1]!.value;
  const names = new Map(employees.map((employee) => [employee.id, employee.name]));
  const current = employees.filter((employee) => employee.active);

  return (
    <>
      <PageHeader title="Payroll" description="Each month's pay as your payslips or payroll provider show it. It's posted to the books and totalled for the EMP201." />
      <TaxTabs current="payroll" />
      <div className="grid max-w-admin gap-6">
        {!on ? (
          <EmptyState
            title="Payroll is off"
            icon={<Users aria-hidden="true" />}
            actions={
              <ButtonLink variant="primary" href={taxPaths.registrations}>
                Record a registration
              </ButtonLink>
            }
          >
            It switches on once you record the business&apos;s PAYE, UIF or SDL registration.
          </EmptyState>
        ) : (
          <>
            <Panel title="Record a month's pay" description="The amounts on the payslip. Net pay is gross less PAYE and the employee's UIF.">
              {current.length > 0 ? (
                <PayrollRunForm employees={current.map((employee) => ({ id: employee.id, name: employee.name }))} months={months} defaultPeriod={lastMonth} today={today} action={recordPayrollRun} />
              ) : (
                <EmptyState title="No employees yet" frame="none" actions={<EmployeeSheet employee={null} action={addEmployee} primary />}>
                  Add the people you pay, then record their pay each month.
                </EmptyState>
              )}
            </Panel>

            <Panel title="Employees" actions={current.length > 0 ? <EmployeeSheet employee={null} action={addEmployee} primary={false} /> : undefined} flush>
              {employees.length > 0 ? (
                <ul className="divide-y divide-hairline">
                  {employees.map((employee) => (
                    <li key={employee.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center lg:px-5">
                      <div className="grid min-w-0 gap-0.5">
                        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="font-bold text-ink">{employee.name}</span>
                          {employee.active ? <StatusPill tone="success">Employed</StatusPill> : <StatusPill>Left</StatusPill>}
                        </p>
                        <p className="text-sm text-fg-2">
                          {[
                            `Started ${formatDateShort(employee.startDate)}`,
                            employee.endDate ? `left ${formatDateShort(employee.endDate)}` : null,
                            employee.taxNumberLast4 ? `tax number ${maskedReference(employee.taxNumberLast4)}` : "no tax number recorded",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <EmployeeSheet
                        employee={{ id: employee.id, name: employee.name, startDate: employee.startDate, endDate: employee.endDate, active: employee.active, taxNumber: maskedReference(employee.taxNumberLast4) }}
                        action={updateEmployee}
                        primary={false}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-3 text-sm text-fg-2 lg:px-5">Nobody yet.</p>
              )}
            </Panel>

            <Panel title="Pay recorded" description="Newest month first. A mistake is voided: its journal is reversed and it stays on record, crossed out." flush>
              {runs.length > 0 ? (
                <ul className="divide-y divide-hairline">
                  {runs.map((run) => {
                    const voided = run.voidedAt !== null;
                    const name = names.get(run.employeeId) ?? "Employee";
                    return (
                      <li key={run.id} className="grid gap-2 px-4 py-3 lg:px-5">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                          <p className={cx("min-w-0", voided && "text-fg-3 line-through")}>
                            <span className="font-bold">{name}</span> · {formatMonth(run.period)}
                          </p>
                          <p className={cx("text-right tabular-nums", voided ? "text-fg-3 line-through" : "font-bold text-ink")} data-numeric>
                            {formatCents(run.grossCents)} gross
                          </p>
                        </div>
                        <p className="text-sm text-fg-2 tabular-nums">
                          Paid {formatDateShort(run.paidOn)} · PAYE {formatCents(run.payeCents)} · UIF {formatCents(run.uifEmployeeCents)} from the employee, {formatCents(run.uifEmployerCents)} from the business · SDL {formatCents(run.sdlCents)} · net {formatCents(run.netCents)}
                        </p>
                        {voided && <p className="text-sm text-fg-2">Voided: {run.voidReason}</p>}
                        {(checks[run.id] ?? []).map((warning) => (
                          <p key={warning} className="rounded-sm bg-warning-50 px-3 py-2 text-sm text-warning-800">
                            {warning}
                          </p>
                        ))}
                        {!voided && (
                          <div>
                            <VoidRunButton id={run.id} subject={`${name}'s pay for ${formatMonth(run.period)}`} action={voidPayrollRun} />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-4 py-3 text-sm text-fg-2 lg:px-5">No pay recorded yet.</p>
              )}
            </Panel>
          </>
        )}
      </div>
    </>
  );
}
