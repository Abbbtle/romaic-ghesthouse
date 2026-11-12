import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { csvCell } from "./export";
import { checkedText, describeValue, isSarsUrl, lookUp, taxOnTable } from "./parameters";
import { emp201Due, lastBusinessDayOf, provisionalPeriod, provisionalThirdDue, taxYearContaining, vatPeriodEnding, vatReturnDue } from "./periods";
import { returnsNeeding, whatItBlocks } from "./returns";
import { fixture, unverifiedFixture } from "./testing/harness";

describe("parameters", () => {
  it("accept only pages on sars.gov.za", () => {
    assert.equal(isSarsUrl("https://www.sars.gov.za/types-of-tax/value-added-tax/"), true);
    assert.equal(isSarsUrl("https://sars.gov.za/x"), true);
    for (const url of ["http://www.sars.gov.za/x", "https://www.sars.gov.za.example.com/x", "https://evilsars.gov.za/x", "https://user@www.sars.gov.za/x", "https://www.sars.gov.za:8443/x", "javascript:alert(1)", "not a url"]) {
      assert.equal(isSarsUrl(url), false, url);
    }
  });

  it("find the latest version covering a date, and say why there's none", () => {
    const old = fixture("vat.standard-rate", 15, "2025-05-01");
    const newer = { ...fixture("vat.standard-rate", 16, "2027-04-01"), version: 2 };
    const before = lookUp([old, newer], "vat.standard-rate", "2027-03-31");
    assert.equal(before.status === "verified" && before.value, 15);
    const after = lookUp([old, newer], "vat.standard-rate", "2027-04-01");
    assert.equal(after.status === "verified" && after.value, 16);
    const none = lookUp([old], "vat.standard-rate", "2025-04-30");
    assert.deepEqual(none.status === "missing" && [none.reason, none.message], ["none", "VAT standard rate has no value covering 2025-04-30. Add one checked on sars.gov.za under Tax › Rates and dates."]);
    const hidden = lookUp([old, unverifiedFixture("vat.standard-rate", 3, "2026-01-01")], "vat.standard-rate", "2026-06-01");
    assert.equal(hidden.status === "missing" && hidden.reason, "unverified");
    const wrongShape = lookUp([fixture("uif.rates", { employee: 1 })], "uif.rates", "2026-06-01");
    assert.equal(wrongShape.status === "missing" && wrongShape.reason, "invalid");
  });

  it("work tax out on a sliding table", () => {
    const table = {
      bands: [
        { overCents: 0, baseCents: 0, ratePercent: 0 },
        { overCents: 60_000_000, baseCents: 0, ratePercent: 1 },
        { overCents: 95_000_000, baseCents: 350_000, ratePercent: 2 },
      ],
    };
    assert.equal(taxOnTable(table, 50_000_000), 0);
    assert.equal(taxOnTable(table, 95_000_000), 350_000, "the top of a band");
    assert.equal(taxOnTable(table, 100_000_000), 350_000 + 100_000);
    assert.equal(taxOnTable(table, -5), 0);
  });

  it("describe values in plain words", () => {
    assert.equal(describeValue("vat.standard-rate", 15), "15%");
    assert.equal(describeValue("vat.compulsory-threshold", 230_000_000), "R2,300,000");
    assert.equal(describeValue("records.keep-years", 5), "5 years");
    assert.equal(describeValue("vat.return-due", { manualDay: 25, efilingLastBusinessDay: true }), "25th of the next month; eFiling: its last business day");
    assert.equal(describeValue("vat.long-stay-rule", null), "Not verified");
  });

  it("say who checked a version: during the build for the seed, the owner by name for one they added", () => {
    assert.equal(checkedText(fixture("vat.standard-rate", 15, "2025-05-01", null, { checkedBy: "Weberu, during the build" })), "Checked on sars.gov.za on 12 Nov 2026, during the build");
    assert.equal(checkedText(fixture("vat.standard-rate", 15, "2025-05-01", null, { checkedBy: "Nico", checkedOn: "2027-03-03", createdBy: "00000000-0000-4000-8000-0000000000a1" })), "Checked 3 Mar 2027 by Nico");
  });

  it("name the returns an unverified one blocks, or say none is refused", () => {
    assert.deepEqual(returnsNeeding("vat.standard-rate"), ["vat201"]);
    assert.equal(whatItBlocks("paye.emp201-due"), "EMP201 returns are refused until it's verified.");
    assert.equal(whatItBlocks("turnover.rate-table"), "Turnover tax returns are refused until it's verified.");
    assert.equal(whatItBlocks("vat.long-stay-rule"), "No return needs it, so none is refused.", "seeded unverified");
    assert.equal(whatItBlocks("turnover.interim-payments"), "No return needs it, so none is refused.", "seeded unverified");
  });
});

describe("periods and due dates", () => {
  it("skip weekends back to the business day before", () => {
    assert.equal(lastBusinessDayOf("2027-02"), "2027-02-26", "28 February 2027 is a Sunday");
    assert.deepEqual(vatReturnDue({ manualDay: 25, efilingLastBusinessDay: true }, "2027-03-31"), { manual: "2027-04-23", efiling: "2027-04-30" });
    assert.equal(emp201Due({ daysAfterMonthEnd: 7 }, "2026-10"), "2026-11-06");
  });

  it("find VAT periods by category", () => {
    const b = { months: 2, endMonths: [2, 4, 6, 8, 10, 12], who: "" };
    assert.deepEqual(vatPeriodEnding(b, 2, "2026-12"), { start: "2026-11-01", end: "2026-12-31" });
    assert.equal(vatPeriodEnding(b, 2, "2026-11"), null);
    assert.deepEqual(vatPeriodEnding({ months: 12, endMonths: "year-end", who: "" }, 2, "2027-02"), { start: "2026-03-01", end: "2027-02-28" });
  });

  it("work out provisional tax periods from the year of assessment", () => {
    const year = taxYearContaining("2026-11-12", 2);
    assert.deepEqual(year, { start: "2026-03-01", end: "2027-02-28" });
    const rule = { firstMonthsFromStart: 6, secondLastBusinessDayOfYear: true, thirdFebruaryYearEndMonth: 9, thirdOtherMonthsAfterEnd: 6 };
    assert.deepEqual(provisionalPeriod(rule, year, "first"), { start: "2026-03-01", end: "2026-08-31", due: "2026-08-31" });
    assert.deepEqual(provisionalPeriod(rule, year, "second"), { start: "2026-03-01", end: "2027-02-28", due: "2027-02-26" });
    assert.equal(provisionalThirdDue(rule, year, false), "2027-09-30");
    assert.equal(provisionalThirdDue(rule, taxYearContaining("2026-11-12", 6), true), "2027-12-31", "a June company: six months after its year ends");
  });
});

describe("the CSV export", () => {
  it("makes formulas inert and quotes what needs it", () => {
    assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
    assert.equal(csvCell("-1+1"), "'-1+1");
    assert.equal(csvCell('Says "hi", twice'), '"Says ""hi"", twice"');
    assert.equal(csvCell(-12), "-12");
    assert.equal(csvCell({ amount: "-80.50" }), "-80.50");
    assert.equal(csvCell(null), "");
  });
});
