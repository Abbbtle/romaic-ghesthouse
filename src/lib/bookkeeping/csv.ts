/**
 * A small CSV reader (RFC 4180) for bank statements: fields separated by a
 * comma or a semicolon, records by CRLF or LF (or a lone CR), fields in
 * double quotes holding separators, quotes ("" for one) and line breaks.
 * A UTF-8 byte order mark at the start is dropped. It's lenient where real
 * exports aren't strict: a quote inside an unquoted field is kept as it is,
 * and text straight after a closing quote is added to the field. A quoted
 * field that never closes is an error, since everything after it would
 * shift.
 */

export const csvSeparators = [",", ";"] as const;
export type CsvSeparator = (typeof csvSeparators)[number];

export const csvSeparatorNames: Record<CsvSeparator, string> = { ",": "Commas", ";": "Semicolons" };

export type CsvResult = { ok: true; rows: string[][] } | { ok: false; problem: "unclosed-quote" | "too-many-rows"; row: number };

const bom = "﻿";

/** The rows of `text`, each a list of fields. A last empty line is ignored; at most `maxRows` rows. */
export function parseCsv(text: string, separator: CsvSeparator, maxRows = Number.POSITIVE_INFINITY): CsvResult {
  const source = text.startsWith(bom) ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let fieldStarted = false;
  let quoteRow = 0;
  let index = 0;

  const endField = () => {
    row.push(field);
    field = "";
    fieldStarted = false;
  };
  const endRow = (): boolean => {
    endField();
    rows.push(row);
    row = [];
    return rows.length <= maxRows;
  };

  while (index < source.length) {
    const char = source[index]!;
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }
    if (char === '"' && !fieldStarted) {
      quoted = true;
      fieldStarted = true;
      quoteRow = rows.length + 1;
      index += 1;
      continue;
    }
    if (char === separator) {
      endField();
      index += 1;
      continue;
    }
    if (char === "\r" || char === "\n") {
      if (!endRow()) return { ok: false, problem: "too-many-rows", row: rows.length };
      index += char === "\r" && source[index + 1] === "\n" ? 2 : 1;
      continue;
    }
    field += char;
    fieldStarted = true;
    index += 1;
  }

  if (quoted) return { ok: false, problem: "unclosed-quote", row: quoteRow };
  // Text that doesn't end with a line break still has a last row; an empty last line isn't one.
  if (fieldStarted || field !== "" || row.length > 0) {
    if (!endRow()) return { ok: false, problem: "too-many-rows", row: rows.length };
  }
  return { ok: true, rows };
}

/**
 * The separator a file most likely uses: whichever of comma and semicolon
 * appears more often outside quotes in its first few lines (comma when
 * they tie). Only a starting point: the owner can change it.
 */
export function guessSeparator(text: string): CsvSeparator {
  const counts: Record<CsvSeparator, number> = { ",": 0, ";": 0 };
  let quoted = false;
  let lines = 0;
  for (const char of text.slice(0, 4000)) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === "," || char === ";")) counts[char] += 1;
    else if (!quoted && char === "\n" && (lines += 1) >= 10) break;
  }
  return counts[";"] > counts[","] ? ";" : ",";
}
