/**
 * Spreadsheet files (RFC 4180): cells separated by commas, rows by CRLF, a
 * cell quoted when it holds a comma, a quote, a line break or spaces at its
 * ends. Text that a spreadsheet would run as a formula (it starts with =, +,
 * -, @, a tab or a carriage return) gets an apostrophe in front, so it opens
 * as the text it is. Plain numbers ("-1250.50") are left alone, so columns of
 * amounts still add up.
 */

export type CsvValue = string | number | null | undefined;

const formulaStart = /^[=+\-@\t\r]/;
const plainNumber = /^-?\d+(\.\d+)?$/;

/** One cell, guarded and quoted as it needs. */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const text = formulaStart.test(value) && !plainNumber.test(value) ? `'${value}` : value;
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** One row of cells. */
export function csvRow(cells: readonly CsvValue[]): string {
  return cells.map(csvCell).join(",");
}

/**
 * A whole file: rows ending in CRLF, after a byte-order mark so spreadsheet
 * programs read it as UTF-8 (names like "Owner's capital" and dashes intact).
 */
export function csvDocument(rows: readonly (readonly CsvValue[])[]): string {
  return `﻿${rows.map(csvRow).join("\r\n")}\r\n`;
}
