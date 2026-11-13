import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mappingFieldsSchema } from "./bookkeeping-input";
import { parseCsv } from "./csv";
import { decodeStatement, dedupeKeys, guessDateFormat, mappingFits, parseStatementAmount, parseStatementDate, readStatement, suggestMapping, type StatementMapping } from "./statement";

const mapping = (fields: Partial<StatementMapping> = {}): StatementMapping => ({
  separator: ",",
  skipRows: 0,
  hasHeader: true,
  dateColumn: 0,
  dateFormat: "yyyy-mm-dd",
  descriptionColumn: 1,
  referenceColumn: null,
  amount: { kind: "single", column: 2 },
  balanceColumn: 3,
  decimal: ".",
  ...fields,
});

const rowsOf = (text: string, separator: "," | ";" = ",") => {
  const parsed = parseCsv(text, separator);
  assert.ok(parsed.ok);
  return parsed.rows;
};

describe("statement dates", () => {
  it("reads each format the owner can choose, ignoring a time after the date", () => {
    const cases: [string, Parameters<typeof parseStatementDate>[1]][] = [
      ["2026-11-05", "yyyy-mm-dd"],
      ["2026/11/05", "yyyy/mm/dd"],
      ["05/11/2026", "dd/mm/yyyy"],
      ["11/05/2026", "mm/dd/yyyy"],
      ["05-11-2026", "dd-mm-yyyy"],
      ["05.11.2026", "dd.mm.yyyy"],
      ["05/11/26", "dd/mm/yy"],
      ["20261105", "yyyymmdd"],
      ["5 Nov 2026", "d mmm yyyy"],
      ["05-Nov-2026", "d mmm yyyy"],
      ["5 November 2026", "d mmm yyyy"],
      ["5 Des 2026", "d mmm yyyy"],
      ["2026-11-05 14:32:10", "yyyy-mm-dd"],
      ["5/11/2026", "dd/mm/yyyy"],
    ];
    for (const [value, format] of cases) {
      const expected = value === "5 Des 2026" ? "2026-12-05" : "2026-11-05";
      assert.equal(parseStatementDate(value, format), expected, `${value} as ${format}`);
    }
  });

  it("refuses dates that don't exist or don't fit the format", () => {
    assert.equal(parseStatementDate("31/02/2026", "dd/mm/yyyy"), null);
    assert.equal(parseStatementDate("2026-11-05", "dd/mm/yyyy"), null);
    assert.equal(parseStatementDate("13/13/2026", "mm/dd/yyyy"), null);
    assert.equal(parseStatementDate("5 Foo 2026", "d mmm yyyy"), null);
    assert.equal(parseStatementDate("", "yyyy-mm-dd"), null);
  });

  it("guesses day-first when both orders fit, as South Africa writes dates", () => {
    assert.equal(guessDateFormat(["05/11/2026", "06/11/2026"]), "dd/mm/yyyy");
    assert.equal(guessDateFormat(["11/25/2026"]), "mm/dd/yyyy");
    assert.equal(guessDateFormat(["2026-11-05"]), "yyyy-mm-dd");
  });
});

describe("statement amounts", () => {
  it("reads signs written every common way, in cents", () => {
    assert.equal(parseStatementAmount("600.00", "."), 60_000);
    assert.equal(parseStatementAmount("-120.50", "."), -12_050);
    assert.equal(parseStatementAmount("(120.50)", "."), -12_050);
    assert.equal(parseStatementAmount("120.50-", "."), -12_050);
    assert.equal(parseStatementAmount("120.50 Dr", "."), -12_050);
    assert.equal(parseStatementAmount("120.50Cr", "."), 12_050);
    assert.equal(parseStatementAmount("R1,250.5", "."), 125_050);
    assert.equal(parseStatementAmount("-R 1 250.00", "."), -125_000);
    assert.equal(parseStatementAmount("+3", "."), 300);
    assert.equal(parseStatementAmount("−5.00", "."), -500, "a typographic minus");
  });

  it("follows the decimal mark chosen", () => {
    assert.equal(parseStatementAmount("1 250,50", ","), 125_050);
    assert.equal(parseStatementAmount("1.250,50", ","), 125_050);
    assert.equal(parseStatementAmount("-12,5", ","), -1_250);
    assert.ok(Number.isNaN(parseStatementAmount("1.234", ".")), "three decimals isn't cents");
    assert.equal(parseStatementAmount("1.230", "."), 123, "a trailing zero is fine");
  });

  it("answers null for an empty cell and NaN for one that isn't an amount", () => {
    assert.equal(parseStatementAmount("  ", "."), null);
    assert.ok(Number.isNaN(parseStatementAmount("abc", ".")));
    assert.ok(Number.isNaN(parseStatementAmount("1.2.3", ".")));
  });
});

describe("reading a statement", () => {
  it("reads lines with one signed amount column and a balance", () => {
    const rows = rowsOf("Date,Description,Amount,Balance\n2026-11-05,EFT T Mokoena,600.00,1600.00\n2026-11-06,Spar Welkom,-120.50,1479.50\n\n");
    assert.deepEqual(readStatement(rows, mapping()), {
      headings: ["Date", "Description", "Amount", "Balance"],
      problems: [],
      lines: [
        { row: 2, date: "2026-11-05", description: "EFT T Mokoena", amountCents: 60_000, balanceCents: 160_000 },
        { row: 3, date: "2026-11-06", description: "Spar Welkom", amountCents: -12_050, balanceCents: 147_950 },
      ],
    });
  });

  it("reads separate money in and money out columns, skips rows above, and adds a reference", () => {
    const rows = rowsOf("Account statement;;;;\nPeriod: November;;;;\nDatum;Beskrywing;Verwysing;In;Uit\n05/11/2026;EFT;RG-B2C3D;600,00;\n06/11/2026;Fees;;;-35,00\n", ";");
    const reading = readStatement(rows, mapping({ separator: ";", skipRows: 2, dateFormat: "dd/mm/yyyy", referenceColumn: 2, amount: { kind: "split", inColumn: 3, outColumn: 4 }, balanceColumn: null, decimal: "," }));
    assert.deepEqual(reading.problems, []);
    assert.deepEqual(
      reading.lines.map((line) => [line.row, line.date, line.description, line.amountCents]),
      [
        [4, "2026-11-05", "EFT · RG-B2C3D", 60_000],
        [5, "2026-11-06", "Fees", -3_500],
      ],
    );
  });

  it("lists rows it can't read, with why, and leaves them out", () => {
    const rows = rowsOf("Date,Description,Amount,Balance\n2026-11-05,EFT,600.00,1600\nClosing balance,,,1600\n2026-11-06,Nothing,0,1600\n2026-11-07,Odd,abc,1600\n2026-11-08,Huge,20000000,1600\n,,,\n");
    const reading = readStatement(rows, mapping());
    assert.equal(reading.lines.length, 1);
    assert.deepEqual(reading.problems, [
      { row: 3, reason: '"Closing balance" isn\'t a date written 2026-11-05' },
      { row: 4, reason: "its amount is zero" },
      { row: 5, reason: '"abc" isn\'t an amount' },
      { row: 6, reason: "its amount is more than R10,000,000" },
    ]);
  });

  it("checks the columns chosen are in the file", () => {
    assert.equal(mappingFits(mapping(), 4), true);
    assert.equal(mappingFits(mapping(), 3), false);
    assert.equal(mappingFits(mapping({ amount: { kind: "split", inColumn: 2, outColumn: 5 }, balanceColumn: null }), 4), false);
  });

  it("keeps two identical lines on one day apart, the same way each import", () => {
    const line = { row: 2, date: "2026-11-05", description: "Airtime", amountCents: -5_000, balanceCents: null };
    const keys = dedupeKeys([line, { ...line, row: 3 }, { ...line, description: "AIRTIME ", row: 4 }]);
    assert.equal(new Set(keys).size, 3);
    assert.deepEqual(dedupeKeys([line, { ...line, row: 9 }]), keys.slice(0, 2), "the row in the file doesn't matter");
  });
});

describe("a first suggestion for the columns", () => {
  it("reads the usual headings and the sample's date format and decimal mark", () => {
    const rows = rowsOf("Bank export\nDate;Description;Debit;Credit;Balance\n05/11/2026;EFT;;600,00;1 600,00\n06/11/2026;Fees;35,00;;1 565,00\n", ";");
    const suggestion = suggestMapping(rows, ";");
    assert.equal(suggestion.dateColumn, 0);
    assert.equal(suggestion.dateFormat, "dd/mm/yyyy");
    assert.equal(suggestion.descriptionColumn, 1);
    assert.deepEqual(suggestion.amount, { kind: "split", inColumn: 3, outColumn: 2 });
    assert.equal(suggestion.balanceColumn, 4);
    assert.equal(suggestion.decimal, ",");
    assert.deepEqual([suggestion.skipRows, suggestion.hasHeader], [1, true], "the bank's line above the headings is skipped");
  });

  it("starts at the first dated row when there are no headings", () => {
    const suggestion = suggestMapping(rowsOf("Statement for account 1234\n\n2026-11-05,EFT,600.00\n2026-11-06,Fees,-35.00\n"), ",");
    assert.deepEqual([suggestion.skipRows, suggestion.hasHeader, suggestion.dateColumn, suggestion.descriptionColumn, suggestion.amount], [2, false, 0, 1, { kind: "single", column: 2 }]);
  });

  it("finds a header row on top and a single amount column", () => {
    const suggestion = suggestMapping(rowsOf("Date,Description,Amount,Balance\n2026-11-05,EFT,600.00,1600.00\n"), ",");
    assert.deepEqual([suggestion.hasHeader, suggestion.dateFormat, suggestion.amount, suggestion.balanceColumn, suggestion.decimal], [true, "yyyy-mm-dd", { kind: "single", column: 2 }, 3, "."]);
  });
});

describe("the import form's columns", () => {
  it("reads into a mapping, and asks for what's missing", () => {
    const parsed = mappingFieldsSchema.safeParse({ separator: ",", skipRows: "", hasHeader: "on", dateColumn: "0", dateFormat: "yyyy-mm-dd", descriptionColumn: "1", referenceColumn: "", amountKind: "single", amountColumn: "2", balanceColumn: "3", decimal: "." });
    assert.ok(parsed.success);
    assert.deepEqual(parsed.data, mapping());
    const missing = mappingFieldsSchema.safeParse({ separator: ",", dateColumn: "0", dateFormat: "yyyy-mm-dd", descriptionColumn: "1", amountKind: "split", inColumn: "2", outColumn: "2", decimal: "." });
    assert.equal(missing.success, false);
  });
});

describe("decoding an uploaded file", () => {
  it("reads UTF-8, and falls back to Windows-1252 for older exports", () => {
    assert.equal(decodeStatement(new TextEncoder().encode("Café – R50")), "Café – R50");
    assert.equal(decodeStatement(new Uint8Array([0x43, 0x61, 0x66, 0xe9, 0x20, 0x96])), "Café –");
  });
});
