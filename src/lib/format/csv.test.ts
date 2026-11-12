import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { csvCell, csvDocument, csvRow } from "./csv";

describe("CSV cells", () => {
  it("leaves plain text and numbers as they are", () => {
    assert.equal(csvCell("Accommodation"), "Accommodation");
    assert.equal(csvCell(1250.5), "1250.5");
    assert.equal(csvCell("1250.50"), "1250.50");
    assert.equal(csvCell(""), "");
    assert.equal(csvCell(null), "");
    assert.equal(csvCell(undefined), "");
    assert.equal(csvCell(Number.NaN), "");
  });

  it("puts an apostrophe before text a spreadsheet would run as a formula", () => {
    assert.equal(csvCell("=SUM(A1:A9)"), "'=SUM(A1:A9)");
    assert.equal(csvCell("+27 82 123 4567"), "'+27 82 123 4567");
    assert.equal(csvCell("-2+3+cmd|' /C calc'!A0"), "'-2+3+cmd|' /C calc'!A0");
    assert.equal(csvCell("@SUM(1,1)"), `"'@SUM(1,1)"`);
    assert.equal(csvCell("\t=1+1"), "'\t=1+1");
    assert.equal(csvCell("\r=1+1"), `"'\r=1+1"`);
  });

  it("keeps negative amounts as numbers", () => {
    assert.equal(csvCell("-1250.50"), "-1250.50");
    assert.equal(csvCell("-0.07"), "-0.07");
    assert.equal(csvCell(-1250.5), "-1250.5");
    assert.equal(csvCell("-1,250"), `"'-1,250"`, "only plain digits count as a number");
  });

  it("quotes cells with commas, quotes, line breaks or spaces at the ends", () => {
    assert.equal(csvCell("Electricity, water and gas"), `"Electricity, water and gas"`);
    assert.equal(csvCell('The "big" fix'), `"The ""big"" fix"`);
    assert.equal(csvCell("Two\nlines"), `"Two\nlines"`);
    assert.equal(csvCell(" padded "), `" padded "`);
    assert.equal(csvCell("Owner's capital"), "Owner's capital");
  });
});

describe("CSV rows and files", () => {
  it("joins cells with commas", () => {
    assert.equal(csvRow(["4000", "Accommodation", "1250.00"]), "4000,Accommodation,1250.00");
    assert.equal(csvRow(["", "Total", null]), ",Total,");
  });

  it("starts with a byte-order mark and ends every row with CRLF", () => {
    assert.equal(csvDocument([["Code", "Account"], ["4000", "Accommodation"]]), "﻿Code,Account\r\n4000,Accommodation\r\n");
  });
});
