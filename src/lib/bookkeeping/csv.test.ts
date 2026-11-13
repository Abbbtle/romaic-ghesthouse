import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { guessSeparator, parseCsv } from "./csv";

describe("reading CSV", () => {
  it("splits plain rows on the separator, with LF or CRLF line ends", () => {
    assert.deepEqual(parseCsv("Date,Description,Amount\n2026-11-05,EFT,600.00\n", ","), { ok: true, rows: [["Date", "Description", "Amount"], ["2026-11-05", "EFT", "600.00"]] });
    assert.deepEqual(parseCsv("a,b\r\nc,d\r\n", ","), { ok: true, rows: [["a", "b"], ["c", "d"]] });
    assert.deepEqual(parseCsv("a,b\rc,d", ","), { ok: true, rows: [["a", "b"], ["c", "d"]] }, "a lone CR, and no line break at the end");
  });

  it("keeps separators, quotes and line breaks inside quoted fields", () => {
    const text = 'Date,Description,Amount\r\n2026-11-05,"Spar, Welkom",-120.50\r\n2026-11-06,"Says ""hello""\r\nand more",10\r\n';
    assert.deepEqual(parseCsv(text, ","), {
      ok: true,
      rows: [
        ["Date", "Description", "Amount"],
        ["2026-11-05", "Spar, Welkom", "-120.50"],
        ["2026-11-06", 'Says "hello"\r\nand more', "10"],
      ],
    });
  });

  it("drops a UTF-8 byte order mark and reads semicolon files", () => {
    assert.deepEqual(parseCsv("﻿Datum;Bedrag\n05/11/2026;1 250,50\n", ";"), { ok: true, rows: [["Datum", "Bedrag"], ["05/11/2026", "1 250,50"]] });
  });

  it("keeps empty fields and empty rows, but not an empty last line", () => {
    assert.deepEqual(parseCsv("a,,c\n\n,,\n", ","), { ok: true, rows: [["a", "", "c"], [""], ["", "", ""]] });
    assert.deepEqual(parseCsv("", ","), { ok: true, rows: [] });
  });

  it("is lenient about stray quotes, as real exports are", () => {
    assert.deepEqual(parseCsv('5" pipe,"quoted"tail\n', ","), { ok: true, rows: [['5" pipe', "quotedtail"]] });
  });

  it("refuses a quote that never closes, and too many rows", () => {
    assert.deepEqual(parseCsv('a,b\n"open,c\nd,e\n', ","), { ok: false, problem: "unclosed-quote", row: 2 });
    assert.deepEqual(parseCsv("1\n2\n3\n4\n", ",", 3), { ok: false, problem: "too-many-rows", row: 4 });
    assert.equal(parseCsv("1\n2\n3\n", ",", 3).ok, true, "exactly the limit is fine");
  });

  it("guesses the separator from the first lines, ignoring quoted text", () => {
    assert.equal(guessSeparator("Date;Description;Amount\n05/11/2026;Spar;-12,50\n"), ";");
    assert.equal(guessSeparator('Date,Description,Amount\n2026-11-05,"a;b;c;d",1\n'), ",");
    assert.equal(guessSeparator("just one column\n"), ",");
  });
});
