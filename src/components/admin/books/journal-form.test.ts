import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compactJournalFields, errorsOnRows, journalFormProblems, journalTotals, lockedMonthMessage, typedCents } from "./journal-form";

const context = { today: "2026-11-12", lockedPeriods: ["2026-09"] };

const balanced = {
  date: "2026-11-12",
  memo: "Owner put money in",
  "line.0.account": "1000",
  "line.0.debit": "5000",
  "line.0.credit": "",
  "line.0.memo": "",
  "line.1.account": "3000",
  "line.1.debit": "",
  "line.1.credit": "5000",
  "line.1.memo": "",
};

describe("the journal form's running totals", () => {
  it("reads amounts as rand, the way the service does", () => {
    assert.equal(typedCents("1250"), 125_000);
    assert.equal(typedCents("R1,250.50"), 125_050);
    assert.equal(typedCents(""), null);
    assert.equal(typedCents("12.345"), null);
    assert.equal(typedCents("abc"), null);
  });

  it("adds each side and says when they balance", () => {
    assert.deepEqual(
      journalTotals([
        { debit: "1000", credit: "" },
        { debit: "", credit: "600" },
        { debit: "", credit: "400.00" },
      ]),
      { debitCents: 100_000, creditCents: 100_000, differenceCents: 0, balanced: true },
    );
    assert.deepEqual(journalTotals([{ debit: "1000", credit: "" }, { debit: "", credit: "nonsense" }]), {
      debitCents: 100_000,
      creditCents: 0,
      differenceCents: 100_000,
      balanced: false,
    });
  });

  it("doesn't call nothing on both sides balanced", () => {
    assert.equal(journalTotals([{ debit: "", credit: "" }]).balanced, false);
  });
});

describe("the journal form's checks", () => {
  it("passes a balanced journal", () => {
    assert.deepEqual(journalFormProblems(balanced, context), {});
  });

  it("asks for the date, what it's for and each line's account and one amount", () => {
    const errors = journalFormProblems({ date: "", memo: " ", "line.0.debit": "100", "line.1.account": "3000", "line.1.debit": "10", "line.1.credit": "10" }, context);
    assert.equal(errors.date, "Choose the journal's date.");
    assert.equal(errors.memo, "Say what the journal is for.");
    assert.equal(errors["line.0.account"], "Choose an account.");
    assert.equal(errors["line.1.debit"], "Enter the amount as a debit or a credit, not both.");
  });

  it("refuses an unbalanced journal, or one with a single line", () => {
    assert.equal(journalFormProblems({ ...balanced, "line.1.credit": "4000" }, context).form, "Debits (R5,000) and credits (R4,000) must be equal.");
    assert.equal(journalFormProblems({ date: "2026-11-12", memo: "One", "line.0.account": "1000", "line.0.debit": "10" }, context).form, "A journal needs at least two lines.");
  });

  it("refuses a date more than a month ahead, or in a locked month", () => {
    assert.equal(journalFormProblems({ ...balanced, date: "2026-12-14" }, context).date, "Date it no more than a month ahead.");
    assert.equal(journalFormProblems({ ...balanced, date: "2026-12-13" }, context).date, undefined);
    assert.equal(journalFormProblems({ ...balanced, date: "2026-09-30" }, context).date, lockedMonthMessage);
  });
});

describe("sending the journal form to the service", () => {
  it("leaves out empty rows and numbers the rest from 0, remembering where each came from", () => {
    const { fields, rowOf } = compactJournalFields({
      date: "2026-11-12",
      memo: "Depreciation",
      "line.0.account": "",
      "line.0.debit": " ",
      "line.1.account": "6200",
      "line.1.debit": "100",
      "line.2.account": "",
      "line.3.account": "1510",
      "line.3.credit": "100",
      "line.3.memo": "Beds",
    });
    assert.deepEqual(rowOf, [1, 3]);
    assert.deepEqual(fields, {
      date: "2026-11-12",
      memo: "Depreciation",
      "line.0.account": "6200",
      "line.0.debit": "100",
      "line.1.account": "1510",
      "line.1.credit": "100",
      "line.1.memo": "Beds",
    });
  });

  it("puts the service's problems back on the rows they came from", () => {
    assert.deepEqual(errorsOnRows({ "line.1.account": "Line 2: that account is switched off.", date: "Locked", form: "Unbalanced" }, [1, 3]), {
      "line.3.account": "Line 4: that account is switched off.",
      date: "Locked",
      form: "Unbalanced",
    });
  });
});
