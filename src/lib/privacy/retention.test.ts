import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { requestRetentionDays } from "@/lib/booking/retention";
import { fixture } from "@/lib/tax/testing/harness";
import { currentPolicies, defaultPeriod, guestMarginYears, planRetention, recordKeepingFrom, retentionKinds, retentionSchedule, taskPhotoDefaultMonths, type RetentionPolicy } from "./retention";
import { missingKeeping, verifiedKeeping } from "./testing/harness";

const policy = (kind: RetentionPolicy["kind"], version: number, period: number | null): RetentionPolicy => ({
  id: `policy-${kind}-${version}`,
  kind,
  version,
  period,
  setBy: "owner",
  setByName: "Nico",
  setAt: new Date("2026-11-13T08:00:00Z"),
});

const base = { today: "2026-11-13", timeZone: "Africa/Johannesburg" };

describe("the retention plan", () => {
  it("runs nothing on defaults: both rules wait for the owner, with the cut-offs the defaults would give", () => {
    const plan = planRetention({ ...base, policies: [], keeping: verifiedKeeping(5) });
    assert.deepEqual(plan.guests, { status: "waiting", period: 5 + guestMarginYears, cutoff: "2019-11-13", reason: "Waiting for you to confirm the period." });
    assert.equal(plan.taskPhotos.status, "waiting");
    assert.equal(plan.taskPhotos.period, taskPhotoDefaultMonths);
    // Midnight in Johannesburg, a year ago.
    assert.equal(plan.taskPhotos.cutoff?.toISOString(), "2025-11-12T22:00:00.000Z");
  });

  it("runs the confirmed periods, the latest version of each", () => {
    const plan = planRetention({ ...base, policies: [policy("guest-records", 1, 9), policy("guest-records", 2, 6), policy("task-photos", 1, 3)], keeping: verifiedKeeping(5) });
    assert.deepEqual(plan.guests, { status: "ready", period: 6, cutoff: "2020-11-13" });
    assert.equal(plan.taskPhotos.status, "ready");
    assert.equal(plan.taskPhotos.cutoff?.toISOString(), "2026-08-12T22:00:00.000Z");
  });

  it("never anonymises guests while SARS's record-keeping period isn't verified", () => {
    const plan = planRetention({ ...base, policies: [policy("guest-records", 1, 7)], keeping: missingKeeping });
    assert.equal(plan.guests.status, "waiting");
    assert.equal(plan.guests.cutoff, null);
    assert.match(plan.guests.status === "waiting" ? plan.guests.reason : "", /isn't verified/);
    assert.equal(defaultPeriod("guest-records", missingKeeping), null);
  });

  it("stops when SARS's period grows past the confirmed one, and says what to change", () => {
    const plan = planRetention({ ...base, policies: [policy("guest-records", 1, 6)], keeping: verifiedKeeping(8) });
    assert.equal(plan.guests.status, "waiting");
    assert.equal(plan.guests.cutoff, null);
    assert.match(plan.guests.status === "waiting" ? plan.guests.reason : "", /shorter than SARS's record-keeping period \(8 years\)/);
  });

  it("reads each kind's latest version", () => {
    const current = currentPolicies([policy("audit-log", 2, null), policy("audit-log", 1, null), policy("task-photos", 1, 12)]);
    assert.equal(current["audit-log"]?.version, 2);
    assert.equal(current["task-photos"]?.period, 12);
    assert.equal(current["guest-records"], undefined);
  });
});

describe("SARS's record-keeping period", () => {
  it("is the verified value of records.keep-years on the day, with its source, and missing otherwise", () => {
    const verified = fixture("records.keep-years", 5, "2026-03-01", null, { unit: "years", sourceUrl: "https://www.sars.gov.za/businesses-and-employers/record-keeping/" });
    assert.deepEqual(recordKeepingFrom([verified], "2026-11-13"), {
      status: "verified",
      years: 5,
      sourceUrl: "https://www.sars.gov.za/businesses-and-employers/record-keeping/",
      sourceTitle: "Test fixture",
      checkedOn: "2026-11-12",
      note: "Test fixture.",
    });
    assert.equal(recordKeepingFrom([verified], "2026-01-01").status, "missing", "not in force yet");
    assert.equal(recordKeepingFrom([], "2026-11-13").status, "missing");
    const unverified = fixture("records.keep-years", null, "2026-03-01", null, { version: 2, status: "unverified", note: "The page wouldn't load." });
    assert.equal(recordKeepingFrom([verified, unverified], "2026-11-13").status, "missing", "a newer unverified version hides the old one");
  });
});

describe("the retention schedule", () => {
  it("lists every kind of record, in order, with the existing jobs' own numbers", () => {
    const rows = retentionSchedule([], verifiedKeeping(5));
    assert.deepEqual(
      rows.map((row) => row.kind),
      [...retentionKinds],
    );
    const byKind = Object.fromEntries(rows.map((row) => [row.kind, row]));
    assert.match(byKind["booking-requests"]!.rule, new RegExp(`${requestRetentionDays} days after the decision`));
    assert.match(byKind["visitor-keys"]!.rule, /24 hours old/);
    assert.match(byKind.sessions!.rule, /7 days at most \(24 hours for admins\)/);
    assert.match(byKind["audit-log"]!.rule, /no entry can be changed or deleted/);
    assert.match(byKind["bookings-invoices"]!.rule, /never deletes them/);
    assert.equal(byKind["booking-requests"]!.adjustable, null);
  });

  it("states the guest-record period from SARS's verified period plus the margin, as a default until confirmed", () => {
    const [guests, photos] = retentionSchedule([], verifiedKeeping(5));
    assert.equal(guests!.adjustable?.period, 7);
    assert.equal(guests!.adjustable?.isDefault, true);
    assert.deepEqual(guests!.adjustable?.range, { min: 5, max: 30 });
    assert.match(guests!.note ?? "", /At least SARS's record-keeping period \(5 years\)/);
    assert.equal(guests!.confirmed, null);
    assert.equal(photos!.adjustable?.period, 12);
    assert.match(photos!.note ?? "", /default/);
  });

  it("shows a confirmed period with who set it", () => {
    const [guests] = retentionSchedule([policy("guest-records", 1, 6)], verifiedKeeping(5));
    assert.equal(guests!.adjustable?.period, 6);
    assert.equal(guests!.adjustable?.isDefault, false);
    assert.equal(guests!.confirmed?.setByName, "Nico");
  });
});
