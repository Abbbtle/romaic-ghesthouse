"use client";

import { DateField, Select, Switch, TextField } from "@/components/ui/fields";
import type { FormAction } from "@/lib/forms/form-state";
import { parseWith } from "@/lib/forms/parse";
import type { FieldErrors } from "@/lib/kernel/result";
import { employeeSchema, payrollRunSchema, taxLimits } from "@/lib/tax/tax-input";
import { ActionForm } from "../action-form";
import type { ConfirmedActionResult } from "../confirm-button";
import { VoidButton } from "../money/void-button";
import { SheetForm } from "../sheet-form";
import { useToast } from "../toast";

const employeeProblems = (data: FormData): FieldErrors => {
  const parsed = parseWith(employeeSchema, Object.fromEntries(data));
  return parsed.ok ? {} : parsed.errors;
};

/** An employee as the sheet edits them, worded on the server. */
export type EmployeeRow = { id: string; name: string; startDate: string; endDate: string | null; active: boolean; taxNumber: string | null };

/** Adds an employee, or changes one's details, in a sheet. The tax number is kept encrypted; afterwards only its last digits show. */
export function EmployeeSheet({ employee, action, primary }: { employee: EmployeeRow | null; action: FormAction; primary: boolean }) {
  return (
    <SheetForm
      trigger={employee ? "Change" : "Add employee"}
      variant={primary ? "primary" : "secondary"}
      size={employee ? "sm" : "md"}
      title={employee ? employee.name : "Add an employee"}
      description="Their name and dates, and their income tax number if you have it."
    >
      {(close) => (
        <ActionForm action={action} validate={employeeProblems} footer="button" submitLabel={employee ? "Save details" : "Add employee"} pendingLabel="Saving…" onSaved={close}>
          {employee && <input type="hidden" name="employeeId" value={employee.id} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="name" label="Name" autoComplete="off" maxLength={taxLimits.nameMax} defaultValue={employee?.name ?? ""} className="sm:col-span-2" />
            <DateField name="startDate" label="Started on" defaultValue={employee?.startDate ?? ""} />
            <DateField name="endDate" label="Left on" optional defaultValue={employee?.endDate ?? ""} />
            <TextField
              name="taxNumber"
              label="Income tax number"
              optional
              inputMode="numeric"
              autoComplete="off"
              maxLength={20}
              hint={employee?.taxNumber ? `On record: ${employee.taxNumber}. Leave empty to keep it.` : "Kept encrypted. Afterwards only its last four digits are shown."}
              className="sm:col-span-2"
            />
            {employee ? <Switch name="active" label="Still employed" defaultChecked={employee.active} onLabel="Yes" offLabel="No" /> : <input type="hidden" name="active" value="on" />}
          </div>
        </ActionForm>
      )}
    </SheetForm>
  );
}

function runProblems(today: string) {
  return (data: FormData): FieldErrors => {
    const parsed = parseWith(payrollRunSchema, Object.fromEntries(data));
    const errors: FieldErrors = parsed.ok ? {} : { ...parsed.errors };
    if (!errors.paidOn && String(data.get("paidOn") ?? "") > today) errors.paidOn = "Record pay once it's paid: choose today or an earlier day.";
    return errors;
  };
}

/**
 * Records a month's pay for one employee as the payslip shows it: gross,
 * PAYE, UIF (theirs and the business's), SDL, and net pay (left empty, it's
 * gross less PAYE and their UIF). It's posted to the books as it's saved.
 */
export function PayrollRunForm({
  employees,
  months,
  defaultPeriod,
  today,
  action,
}: {
  employees: readonly { id: string; name: string }[];
  /** The months pay can be recorded for, newest first: "2026-10" shown as "October 2026". */
  months: readonly { value: string; label: string }[];
  defaultPeriod: string;
  today: string;
  action: FormAction;
}) {
  return (
    <ActionForm action={action} validate={runProblems(today)} footer="button" submitLabel="Record pay" pendingLabel="Recording…" subject="this pay" resetOnSave>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select name="employeeId" label="Employee" options={employees.map((employee) => ({ value: employee.id, label: employee.name }))} defaultValue={employees[0]?.id} />
        <Select name="period" label="Pay for the month" options={months} defaultValue={defaultPeriod} />
        <DateField name="paidOn" label="Paid on" defaultValue={today} max={today} />
        <TextField name="gross" label="Gross pay (R)" inputMode="decimal" autoComplete="off" placeholder="e.g. 8500" maxLength={16} />
        <TextField name="paye" label="PAYE (R)" inputMode="decimal" autoComplete="off" placeholder="0" maxLength={16} optional />
        <TextField name="uifEmployee" label="UIF from the employee (R)" inputMode="decimal" autoComplete="off" placeholder="0" maxLength={16} optional />
        <TextField name="uifEmployer" label="UIF from the business (R)" inputMode="decimal" autoComplete="off" placeholder="0" maxLength={16} optional />
        <TextField name="sdl" label="SDL (R)" inputMode="decimal" autoComplete="off" placeholder="0" maxLength={16} optional />
        <TextField name="net" label="Net pay (R)" inputMode="decimal" autoComplete="off" maxLength={16} optional hint="Leave empty to work it out: gross less PAYE and their UIF." className="sm:col-span-2" />
      </div>
    </ActionForm>
  );
}

/** Voids a recorded run, asking why: its journal is reversed and the run stays, crossed out. */
export function VoidRunButton({ id, subject, action }: { id: string; subject: string; action: (id: string, reason: string) => Promise<ConfirmedActionResult> }) {
  const toasts = useToast();
  return (
    <VoidButton
      subject={subject}
      description="Its journal in the books is reversed, dated today. The pay stays on record, crossed out, with your reason."
      action={(reason) => action(id, reason)}
      onDone={() => toasts?.show({ message: "Pay voided. It stays on record, crossed out." })}
    />
  );
}
