import { isIsoDate, type IsoDate } from "@/lib/format/zoned-time";
import { csvSeparators, type CsvSeparator } from "./csv";

/**
 * Reading a bank statement exported as CSV. Banks lay their exports out
 * differently and nothing here assumes any bank's layout: on an account's
 * first import the owner says which column holds what, how dates are
 * written and which decimal mark amounts use, with a preview of the first
 * rows. The answer is saved for the account and used again next time.
 */

export const statementLimits = {
  /** 1 MB: years of a small business's statement lines. */
  maxBytes: 1_048_576,
  maxRows: 5_000,
  maxColumns: 60,
  maxSkipRows: 30,
  descriptionMax: 200,
  /** R10,000,000: more than any one line here, so a misread column is caught. */
  maxLineCents: 1_000_000_000,
} as const;

export const dateFormats = ["yyyy-mm-dd", "yyyy/mm/dd", "dd/mm/yyyy", "mm/dd/yyyy", "dd-mm-yyyy", "dd.mm.yyyy", "dd/mm/yy", "yyyymmdd", "d mmm yyyy"] as const;
export type DateFormat = (typeof dateFormats)[number];

/** Each format as the owner recognises it, with 5 November 2026 as the example. */
export const dateFormatNames: Record<DateFormat, string> = {
  "yyyy-mm-dd": "2026-11-05",
  "yyyy/mm/dd": "2026/11/05",
  "dd/mm/yyyy": "05/11/2026 (day first)",
  "mm/dd/yyyy": "11/05/2026 (month first)",
  "dd-mm-yyyy": "05-11-2026",
  "dd.mm.yyyy": "05.11.2026",
  "dd/mm/yy": "05/11/26",
  yyyymmdd: "20261105",
  "d mmm yyyy": "5 Nov 2026",
};

export const decimalMarks = [".", ","] as const;
export type DecimalMark = (typeof decimalMarks)[number];
export const decimalMarkNames: Record<DecimalMark, string> = { ".": "A point: 1,250.50", ",": "A comma: 1 250,50" };

export type AmountColumns = { kind: "single"; column: number } | { kind: "split"; inColumn: number; outColumn: number };

/** Which column holds what, for one account's exports. Columns count from 0. */
export type StatementMapping = {
  separator: CsvSeparator;
  /** Rows above the first line (or above the headings): the bank's name, the account, the period. */
  skipRows: number;
  /** Whether the first row after those holds the columns' headings. */
  hasHeader: boolean;
  dateColumn: number;
  dateFormat: DateFormat;
  descriptionColumn: number;
  /** A second column added to the description, such as a reference. */
  referenceColumn: number | null;
  amount: AmountColumns;
  balanceColumn: number | null;
  decimal: DecimalMark;
};

/** A statement line as read from the file, before it's stored. */
export type StatementLine = {
  /** Its row in the file, counting from 1, for the owner to find it. */
  row: number;
  date: IsoDate;
  description: string;
  /** Money in is positive, money out negative; never zero. */
  amountCents: number;
  balanceCents: number | null;
};

export type StatementProblem = { row: number; reason: string };

export type StatementReading = {
  lines: StatementLine[];
  /** Rows that couldn't be read, left out of the import. */
  problems: StatementProblem[];
  /** The headings row, when there is one. */
  headings: string[] | null;
};

const monthNumbers: Record<string, number> = {
  jan: 1, january: 1, januarie: 1,
  feb: 2, february: 2, februarie: 2,
  mar: 3, march: 3, mrt: 3, maart: 3,
  apr: 4, april: 4,
  may: 5, mei: 5,
  jun: 6, june: 6, junie: 6,
  jul: 7, july: 7, julie: 7,
  aug: 8, august: 8, augustus: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, okt: 10, oktober: 10,
  nov: 11, november: 11,
  dec: 12, december: 12, des: 12, desember: 12,
};

const numericPatterns: Record<Exclude<DateFormat, "d mmm yyyy">, { pattern: RegExp; order: ["y" | "m" | "d", "y" | "m" | "d", "y" | "m" | "d"] }> = {
  "yyyy-mm-dd": { pattern: /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/, order: ["y", "m", "d"] },
  "yyyy/mm/dd": { pattern: /^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:[ T].*)?$/, order: ["y", "m", "d"] },
  "dd/mm/yyyy": { pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T].*)?$/, order: ["d", "m", "y"] },
  "mm/dd/yyyy": { pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T].*)?$/, order: ["m", "d", "y"] },
  "dd-mm-yyyy": { pattern: /^(\d{1,2})-(\d{1,2})-(\d{4})(?:[ T].*)?$/, order: ["d", "m", "y"] },
  "dd.mm.yyyy": { pattern: /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T].*)?$/, order: ["d", "m", "y"] },
  "dd/mm/yy": { pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{2})(?:[ T].*)?$/, order: ["d", "m", "y"] },
  yyyymmdd: { pattern: /^(\d{4})(\d{2})(\d{2})(?:[ T].*)?$/, order: ["y", "m", "d"] },
};

const pad = (value: number) => String(value).padStart(2, "0");

function isoOf(year: number, month: number, day: number): IsoDate | null {
  if (year < 1990 || year > 2100) return null;
  const iso = `${year}-${pad(month)}-${pad(day)}`;
  return isIsoDate(iso) ? iso : null;
}

/** A date cell read in `format`, or null when it isn't one. A time after the date is ignored. */
export function parseStatementDate(raw: string, format: DateFormat): IsoDate | null {
  const value = raw.trim();
  if (format === "d mmm yyyy") {
    const match = /^(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?[\s-]+(\d{4}|\d{2})(?:[ T].*)?$/.exec(value);
    if (!match) return null;
    const month = monthNumbers[match[2]!.toLowerCase()];
    if (!month) return null;
    const year = match[3]!.length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    return isoOf(year, month, Number(match[1]));
  }
  const { pattern, order } = numericPatterns[format];
  const match = pattern.exec(value);
  if (!match) return null;
  const parts = { y: 0, m: 0, d: 0 };
  order.forEach((part, index) => {
    parts[part] = Number(match[index + 1]);
  });
  if (format === "dd/mm/yy") parts.y += 2000;
  return isoOf(parts.y, parts.m, parts.d);
}

/**
 * An amount cell in cents, signed: money out is negative when written
 * "-250.00", "(250.00)", "250.00-" or "250.00 Dr", money in "250.00" or
 * "250.00 Cr". Thousands separators, spaces and a leading R are ignored.
 * Null for an empty cell; NaN for one that isn't an amount.
 */
export function parseStatementAmount(raw: string, decimal: DecimalMark): number | null {
  let value = raw.replace(/[  ']/g, " ").trim();
  if (value === "") return null;
  let negative = false;
  const suffix = /\s*(cr|dr)\.?$/i.exec(value);
  if (suffix) {
    negative = suffix[1]!.toLowerCase() === "dr";
    value = value.slice(0, suffix.index).trim();
  }
  if (/^\(.*\)$/.test(value)) {
    negative = !negative;
    value = value.slice(1, -1).trim();
  }
  if (/^[-−]/.test(value)) {
    negative = !negative;
    value = value.slice(1).trim();
  } else if (value.startsWith("+")) {
    value = value.slice(1).trim();
  }
  if (/[-−]$/.test(value)) {
    negative = !negative;
    value = value.slice(0, -1).trim();
  }
  value = value.replace(/^(zar|r)\s*/i, "");
  if (/^[-−]/.test(value)) {
    negative = !negative;
    value = value.slice(1);
  }
  const thousands = decimal === "." ? /[,\s]/g : /[.\s]/g;
  value = value.replace(thousands, "");
  if (decimal === ",") value = value.replace(",", ".");
  const match = /^(\d{1,12})(?:\.(\d+))?$/.exec(value);
  if (!match) return Number.NaN;
  const fraction = match[2] ?? "";
  if (fraction.length > 2 && !/^0+$/.test(fraction.slice(2))) return Number.NaN;
  const cents = Number(match[1]) * 100 + Number(fraction.slice(0, 2).padEnd(2, "0"));
  return negative ? -cents : cents;
}

const cell = (row: readonly string[], column: number | null): string => (column === null ? "" : (row[column] ?? "").trim());

/** The columns a mapping reads. */
export function mappedColumns(mapping: StatementMapping): number[] {
  const columns = [mapping.dateColumn, mapping.descriptionColumn];
  if (mapping.referenceColumn !== null) columns.push(mapping.referenceColumn);
  if (mapping.amount.kind === "single") columns.push(mapping.amount.column);
  else columns.push(mapping.amount.inColumn, mapping.amount.outColumn);
  if (mapping.balanceColumn !== null) columns.push(mapping.balanceColumn);
  return columns;
}

function readAmount(row: readonly string[], mapping: StatementMapping): number | string {
  if (mapping.amount.kind === "single") {
    const amount = parseStatementAmount(cell(row, mapping.amount.column), mapping.decimal);
    if (amount === null) return "it has no amount";
    if (Number.isNaN(amount)) return `"${cell(row, mapping.amount.column)}" isn't an amount`;
    return amount;
  }
  const moneyIn = parseStatementAmount(cell(row, mapping.amount.inColumn), mapping.decimal);
  const moneyOut = parseStatementAmount(cell(row, mapping.amount.outColumn), mapping.decimal);
  if (moneyIn !== null && Number.isNaN(moneyIn)) return `"${cell(row, mapping.amount.inColumn)}" isn't an amount`;
  if (moneyOut !== null && Number.isNaN(moneyOut)) return `"${cell(row, mapping.amount.outColumn)}" isn't an amount`;
  if (moneyIn === null && moneyOut === null) return "it has no amount";
  // Money in and money out columns usually hold positive numbers; some write money out as negative.
  return Math.abs(moneyIn ?? 0) - Math.abs(moneyOut ?? 0);
}

function clipped(text: string): string {
  const single = text.replace(/\s+/g, " ").trim();
  return single.length > statementLimits.descriptionMax ? `${single.slice(0, statementLimits.descriptionMax - 1)}…` : single;
}

/**
 * A statement's lines, as `mapping` reads `rows`. Empty rows are skipped
 * quietly; rows that can't be read (a total at the end, a misread column)
 * are listed with why, and left out.
 */
export function readStatement(rows: readonly string[][], mapping: StatementMapping): StatementReading {
  const lines: StatementLine[] = [];
  const problems: StatementProblem[] = [];
  const start = mapping.skipRows + (mapping.hasHeader ? 1 : 0);
  const headings = mapping.hasHeader ? (rows[mapping.skipRows] ?? null) : null;
  const columns = mappedColumns(mapping);
  for (let index = start; index < rows.length; index += 1) {
    const row = rows[index]!;
    const number = index + 1;
    if (row.every((value) => value.trim() === "")) continue;
    if (columns.every((column) => cell(row, column) === "")) {
      problems.push({ row: number, reason: "the columns chosen are empty" });
      continue;
    }
    const date = parseStatementDate(cell(row, mapping.dateColumn), mapping.dateFormat);
    if (!date) {
      problems.push({ row: number, reason: cell(row, mapping.dateColumn) ? `"${cell(row, mapping.dateColumn)}" isn't a date written ${dateFormatNames[mapping.dateFormat]}` : "it has no date" });
      continue;
    }
    const amount = readAmount(row, mapping);
    if (typeof amount === "string") {
      problems.push({ row: number, reason: amount });
      continue;
    }
    if (amount === 0) {
      problems.push({ row: number, reason: "its amount is zero" });
      continue;
    }
    if (Math.abs(amount) > statementLimits.maxLineCents) {
      problems.push({ row: number, reason: "its amount is more than R10,000,000" });
      continue;
    }
    let balanceCents: number | null = null;
    if (mapping.balanceColumn !== null && cell(row, mapping.balanceColumn) !== "") {
      const balance = parseStatementAmount(cell(row, mapping.balanceColumn), mapping.decimal);
      if (balance === null || Number.isNaN(balance) || Math.abs(balance) > 100 * statementLimits.maxLineCents) {
        problems.push({ row: number, reason: `"${cell(row, mapping.balanceColumn)}" isn't a balance` });
        continue;
      }
      balanceCents = balance;
    }
    const description = [cell(row, mapping.descriptionColumn), cell(row, mapping.referenceColumn)].filter(Boolean).join(" · ");
    lines.push({ row: number, date, description: clipped(description) || "No description", amountCents: amount, balanceCents });
  }
  return { lines, problems, headings };
}

/**
 * What makes a line the same line when a later statement overlaps this
 * one: its date, amount, balance and description, and which of the
 * identical lines in the file it is (two R50 airtime purchases on one day
 * are two lines). Hashed by the caller, per account.
 */
export function dedupeKeys(lines: readonly StatementLine[]): string[] {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const base = [line.date, line.amountCents, line.balanceCents ?? "", line.description.toLowerCase()].join("|");
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    return `${base}|#${occurrence}`;
  });
}

/** Whether every column a mapping reads exists in the file (counting the widest row read). */
export function mappingFits(mapping: StatementMapping, columnCount: number): boolean {
  return mappedColumns(mapping).every((column) => column >= 0 && column < columnCount);
}

/** The most columns any row has. */
export function columnCountOf(rows: readonly string[][]): number {
  return rows.reduce((widest, row) => Math.max(widest, row.length), 0);
}

const headingHints = {
  date: /date|datum/i,
  description: /desc|narrat|detail|transaction|beskrywing|particulars/i,
  amount: /amount|bedrag|value/i,
  moneyIn: /credit|money in|paid in|deposit|krediet|^in$/i,
  moneyOut: /debit|money out|paid out|withdraw|debiet|^out$/i,
  balance: /balance|saldo/i,
} as const;

/**
 * A first suggestion for an account's first import: the separator given,
 * headings read for the usual words, the date format and decimal mark the
 * sample fits. Only a starting point, which the owner confirms or changes
 * with the preview in front of them.
 */
export function suggestMapping(rows: readonly string[][], separator: CsvSeparator): StatementMapping {
  const top = rows.slice(0, statementLimits.maxSkipRows + 1);
  const hasDate = (row: readonly string[]) => row.some((value) => dateFormats.some((format) => parseStatementDate(value, format) !== null));
  // The headings: a row near the top naming a date column, before any row holding a date.
  const firstDated = top.findIndex(hasDate);
  const headingRow = top.findIndex((row, index) => (firstDated < 0 || index < firstDated) && row.length > 1 && row.some((value) => headingHints.date.test(value)) && !hasDate(row));
  const looksLikeHeadings = headingRow >= 0;
  const skipRows = looksLikeHeadings ? headingRow : Math.max(0, firstDated);
  const headings = looksLikeHeadings ? rows[headingRow]! : [];
  const find = (pattern: RegExp, except: number[] = []) => headings.findIndex((value, index) => !except.includes(index) && pattern.test(value.trim()));
  const sample = rows.slice(skipRows + (looksLikeHeadings ? 1 : 0), skipRows + 40);
  const width = Math.max(1, columnCountOf(sample.length > 0 ? sample : [headings]));

  let dateColumn = find(headingHints.date);
  if (dateColumn < 0) dateColumn = firstColumnWhere(sample, width, (value) => dateFormats.some((format) => parseStatementDate(value, format) !== null));
  const dateFormat = guessDateFormat(sample.map((row) => cell(row, dateColumn)));

  const balanceColumn = find(headingHints.balance);
  const used = [dateColumn, balanceColumn];
  const amountColumn = find(headingHints.amount, used);
  const inColumn = find(headingHints.moneyIn, used);
  const outColumn = find(headingHints.moneyOut, [...used, inColumn]);
  const amount: AmountColumns =
    amountColumn < 0 && inColumn >= 0 && outColumn >= 0 ? { kind: "split", inColumn, outColumn } : { kind: "single", column: amountColumn >= 0 ? amountColumn : Math.min(width - 1, dateColumn + 2) };
  const amountColumns = amount.kind === "single" ? [amount.column] : [amount.inColumn, amount.outColumn];

  let descriptionColumn = find(headingHints.description, [...used, ...amountColumns]);
  if (descriptionColumn < 0) descriptionColumn = firstColumnWhere(sample, width, (value) => /[a-z]{3}/i.test(value) && parseStatementAmount(value, ".") === null, [dateColumn, ...amountColumns]);
  if (descriptionColumn < 0) descriptionColumn = Math.min(width - 1, dateColumn + 1);

  const amountSamples = sample.flatMap((row) => amountColumns.map((column) => cell(row, column))).filter(Boolean);
  const decimal: DecimalMark = amountSamples.some((value) => /,\d{2}(\s*(cr|dr))?\)?-?$/i.test(value)) && !amountSamples.some((value) => /\.\d{2}(\s*(cr|dr))?\)?-?$/i.test(value)) ? "," : ".";

  return {
    separator,
    skipRows,
    hasHeader: looksLikeHeadings,
    dateColumn: Math.max(0, dateColumn),
    dateFormat,
    descriptionColumn,
    referenceColumn: null,
    amount,
    balanceColumn: balanceColumn >= 0 ? balanceColumn : null,
    decimal,
  };
}

function firstColumnWhere(rows: readonly string[][], width: number, test: (value: string) => boolean, except: number[] = []): number {
  for (let column = 0; column < width; column += 1) {
    if (except.includes(column)) continue;
    const values = rows.map((row) => cell(row, column)).filter(Boolean);
    if (values.length > 0 && values.every(test)) return column;
  }
  return -1;
}

/** The first format every non-empty value fits (day-first before month-first, as South Africa writes dates). */
export function guessDateFormat(values: readonly string[]): DateFormat {
  const filled = values.filter((value) => value.trim() !== "");
  return dateFormats.find((format) => filled.length > 0 && filled.every((value) => parseStatementDate(value, format) !== null)) ?? "dd/mm/yyyy";
}

/** Whether a value is one of the separators. */
export function isCsvSeparator(value: unknown): value is CsvSeparator {
  return typeof value === "string" && (csvSeparators as readonly string[]).includes(value);
}

/**
 * Bytes from an uploaded file as text: UTF-8 when they are, otherwise
 * Windows-1252, which older exports use, so "é" and "–" survive.
 */
export function decodeStatement(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
