"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Select, TextField, type FieldOption } from "@/components/ui/fields";
import { Notice } from "@/components/ui/notice";
import { mappingFields, mappingFieldsSchema } from "@/lib/bookkeeping/bookkeeping-input";
import { csvSeparatorNames, csvSeparators, guessSeparator, parseCsv } from "@/lib/bookkeeping/csv";
import {
  columnCountOf,
  dateFormatNames,
  dateFormats,
  decimalMarkNames,
  decimalMarks,
  decodeStatement,
  isCsvSeparator,
  mappingFits,
  readStatement,
  statementLimits,
  suggestMapping,
  type StatementMapping,
} from "@/lib/bookkeeping/statement";
import { formatDateShort } from "@/lib/format/date-time";
import type { FormAction } from "@/lib/forms/form-state";
import { parseWith } from "@/lib/forms/parse";
import type { FieldErrors } from "@/lib/kernel/result";
import { ActionForm } from "../action-form";
import { FileField } from "../expenses/file-field";
import { balanceWords, moneyInOut } from "./bank-labels";

const previewLines = 8;
const accepted = ".csv,text/csv,text/plain,application/vnd.ms-excel";

const withoutFile = (data: FormData) => Object.fromEntries([...data.entries()].filter(([key]) => key !== "file"));

function validate(data: FormData): FieldErrors {
  const parsed = parseWith(mappingFieldsSchema, withoutFile(data));
  const errors: FieldErrors = parsed.ok ? {} : { ...parsed.errors };
  const file = data.get("file");
  if (!(file instanceof File) || file.size === 0) errors.file = "Choose the statement file you exported from your bank.";
  return errors;
}

/** The columns as the selects offer them: the heading (or "Column 3") and an example from the first line. */
function columnOptions(rows: readonly string[][], fields: Record<string, string>): FieldOption[] {
  const skip = Number(fields.skipRows) || 0;
  const hasHeader = fields.hasHeader === "on";
  const headings = hasHeader ? (rows[skip] ?? []) : [];
  const sample = rows.slice(skip + (hasHeader ? 1 : 0)).find((row) => row.some((value) => value.trim() !== "")) ?? [];
  return Array.from({ length: Math.min(columnCountOf(rows), statementLimits.maxColumns) }, (_, column) => {
    const heading = headings[column]?.trim();
    const example = sample[column]?.trim();
    const name = heading ? `${heading}` : `Column ${column + 1}`;
    return { value: String(column), label: example && example !== heading ? `${name} (e.g. ${example.length > 24 ? `${example.slice(0, 23)}…` : example})` : name };
  });
}

/**
 * Imports a statement exported from online banking as CSV (Pattern: form).
 * The file is read in the browser first: on an account's first import the
 * owner says which column holds what, how dates and amounts are written,
 * with a preview of the first lines as they'll be kept; next time those
 * choices are used again (and can be changed). Lines already imported are
 * left alone. The server reads the file again.
 */
export function ImportStatement({ accountId, savedMapping, action }: { accountId: string; savedMapping: StatementMapping | null; action: FormAction }) {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>(() => (savedMapping ? mappingFields(savedMapping) : {}));
  // A new file brings new suggestions: the column fields start again from them.
  const [version, setVersion] = useState(0);
  const [showColumns, setShowColumns] = useState(savedMapping === null);
  const set = (name: string) => (value: string) => setFields((current) => ({ ...current, [name]: value }));

  const separator = isCsvSeparator(fields.separator) ? fields.separator : ",";
  const csv = useMemo(() => (file ? parseCsv(file.text, separator, statementLimits.maxRows + statementLimits.maxSkipRows + 1) : null), [file, separator]);
  const rows = useMemo(() => (csv?.ok ? csv.rows : []), [csv]);
  const columns = useMemo(() => columnOptions(rows, fields), [rows, fields]);
  const mapping = useMemo(() => parseWith(mappingFieldsSchema, fields), [fields]);
  const fits = mapping.ok && mappingFits(mapping.value, columnCountOf(rows));
  const reading = useMemo(() => (csv?.ok && mapping.ok && fits ? readStatement(rows, mapping.value) : null), [csv, rows, mapping, fits]);

  async function choose(chosen: File | null, input: HTMLInputElement) {
    setProblem(null);
    if (!chosen) {
      setFile(null);
      return;
    }
    if (chosen.size > statementLimits.maxBytes) {
      input.value = "";
      setFile(null);
      setProblem("That file is larger than 1 MB. Export a shorter period from your bank.");
      return;
    }
    const text = decodeStatement(new Uint8Array(await chosen.arrayBuffer()));
    const guessed = savedMapping?.separator ?? guessSeparator(text);
    const parsed = parseCsv(text, guessed, statementLimits.maxRows + statementLimits.maxSkipRows + 1);
    if (!savedMapping || (parsed.ok && !mappingFits(savedMapping, columnCountOf(parsed.rows)))) {
      setFields(mappingFields(suggestMapping(parsed.ok ? parsed.rows : [], guessed)));
      setShowColumns(true);
    } else {
      setFields(mappingFields(savedMapping));
    }
    setVersion((current) => current + 1);
    setFile({ name: chosen.name, text });
  }

  const columnChoice = (name: string, label: string, optional = false) => (
    <Select
      name={name}
      label={label}
      optional={optional}
      defaultValue={fields[name] ?? ""}
      placeholder={optional ? undefined : "Choose a column"}
      options={optional ? [{ value: "", label: "None" }, ...columns] : columns}
      onValueChange={set(name)}
    />
  );

  return (
    <ActionForm action={action} validate={validate} footer="button" submitLabel={reading ? `Import ${reading.lines.length} ${reading.lines.length === 1 ? "line" : "lines"}` : "Import statement"} pendingLabel="Importing…" subject="this import" className="grid gap-5">
      <input type="hidden" name="accountId" value={accountId} />
      <FileField
        name="file"
        label="Statement file"
        accept={accepted}
        problem={problem}
        hint="Export it from your online banking as CSV (sometimes called comma-separated or Excel CSV), up to 1 MB."
        onFile={(chosen, input) => void choose(chosen, input)}
      />

      {file && csv && !csv.ok && (
        <Notice tone="danger">
          {csv.problem === "too-many-rows"
            ? `This file has more than ${statementLimits.maxRows.toLocaleString("en-ZA")} rows. Export a shorter period from your bank.`
            : `Row ${csv.row} opens a quote that never closes. Try the other separator below, or check the file.`}
        </Notice>
      )}

      {file && savedMapping && !showColumns && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-2">
          Read with the columns you chose last time.
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowColumns(true)}>
            Change columns
          </Button>
        </p>
      )}

      {file && (
        <fieldset key={version} hidden={!showColumns} className="grid min-w-0 gap-4 border-t border-hairline pt-5">
          <legend className="float-left mb-1 w-full text-base font-bold text-ink">Which column holds what</legend>
          <p className="text-sm text-fg-2">Every bank lays its file out differently. Choose once for this account; the preview below shows how the lines will be read.</p>
          <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
            <Select name="separator" label="Columns are separated by" defaultValue={fields.separator ?? ","} options={csvSeparators.map((value) => ({ value, label: csvSeparatorNames[value] }))} onValueChange={set("separator")} />
            <TextField name="skipRows" label="Rows to skip at the top" inputMode="numeric" maxLength={2} defaultValue={fields.skipRows ?? "0"} hint="Lines like the bank's name or the period, above the first line." onValueChange={set("skipRows")} />
          </div>
          <Checkbox name="hasHeader" label="The first row after those holds the column headings" defaultChecked={fields.hasHeader === "on"} onCheckedChange={(checked) => set("hasHeader")(checked ? "on" : "")} />
          <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
            {columnChoice("dateColumn", "Date")}
            <Select name="dateFormat" label="Dates are written like" defaultValue={fields.dateFormat ?? "dd/mm/yyyy"} options={dateFormats.map((value) => ({ value, label: dateFormatNames[value] }))} onValueChange={set("dateFormat")} />
            {columnChoice("descriptionColumn", "Description")}
            {columnChoice("referenceColumn", "Reference, added to the description", true)}
            <Select
              name="amountKind"
              label="Amounts are in"
              defaultValue={fields.amountKind ?? "single"}
              options={[
                { value: "single", label: "One column (money out with a minus)" },
                { value: "split", label: "Separate money in and money out columns" },
              ]}
              onValueChange={set("amountKind")}
            />
            <Select name="decimal" label="The decimal mark is" defaultValue={fields.decimal ?? "."} options={decimalMarks.map((value) => ({ value, label: decimalMarkNames[value] }))} onValueChange={set("decimal")} />
            {fields.amountKind === "split" ? (
              <>
                {columnChoice("inColumn", "Money in")}
                {columnChoice("outColumn", "Money out")}
              </>
            ) : (
              columnChoice("amountColumn", "Amount")
            )}
            {columnChoice("balanceColumn", "Balance", true)}
          </div>
        </fieldset>
      )}

      {file && csv?.ok && (
        <section aria-labelledby="statement-preview" className="grid gap-3 border-t border-hairline pt-5">
          <h2 id="statement-preview" className="text-base font-bold text-ink">
            Preview
          </h2>
          {!mapping.ok ? (
            <p className="text-sm text-fg-2">Choose the columns above to see the lines.</p>
          ) : !fits ? (
            <Notice tone="warning">Some of the columns chosen aren&rsquo;t in this file. Check the columns, or the separator.</Notice>
          ) : reading && reading.lines.length === 0 ? (
            <Notice tone="warning">No lines can be read with these choices{reading.problems[0] ? `: row ${reading.problems[0].row}, ${reading.problems[0].reason}` : ""}. Check the date format and the columns.</Notice>
          ) : reading ? (
            <>
              <p className="text-sm text-fg-2">
                {reading.lines.length} {reading.lines.length === 1 ? "line" : "lines"} from {formatDateShort(reading.lines.reduce((first, line) => (line.date < first ? line.date : first), reading.lines[0]!.date))} to{" "}
                {formatDateShort(reading.lines.reduce((last, line) => (line.date > last ? line.date : last), reading.lines[0]!.date))}. Lines already imported are skipped.
              </p>
              <ol aria-label="The first lines" className="divide-y divide-hairline border-y border-hairline">
                {reading.lines.slice(0, previewLines).map((line) => (
                  <li key={line.row} className="grid gap-0.5 py-2.5">
                    <span className="min-w-0 break-words text-ink">{line.description}</span>
                    <span className="flex justify-between gap-3 text-sm text-fg-2">
                      <span className="min-w-0">
                        {formatDateShort(line.date)}
                        {line.balanceCents !== null && <span className="tabular-nums"> · balance {balanceWords(line.balanceCents)}</span>}
                      </span>
                      <span className="shrink-0 font-medium whitespace-nowrap text-ink tabular-nums" data-numeric>
                        {moneyInOut(line.amountCents)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
              {reading.problems.length > 0 && (
                <Notice tone="warning" title={`${reading.problems.length} ${reading.problems.length === 1 ? "row" : "rows"} can't be read and will be left out`}>
                  <ul className="mt-1 grid gap-0.5">
                    {reading.problems.slice(0, 5).map((entry) => (
                      <li key={entry.row}>
                        Row {entry.row}: {entry.reason}
                      </li>
                    ))}
                  </ul>
                  {reading.problems.length > 5 && <p className="mt-1">And {reading.problems.length - 5} more. A total or closing balance row is fine to leave out.</p>}
                </Notice>
              )}
            </>
          ) : null}
        </section>
      )}
    </ActionForm>
  );
}
