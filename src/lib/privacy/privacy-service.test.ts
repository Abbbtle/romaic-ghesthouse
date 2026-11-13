import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { anonymisedGuestName } from "./privacy";
import { actorWith, missingKeeping, privacyHarness, TestNotAllowed, verifiedKeeping } from "./testing/harness";

const guestId = "00000000-0000-4000-8000-00000000c001";
const bookingId = "00000000-0000-4000-8000-00000000d001";

const newRequest = {
  kind: "access",
  requesterName: "Thandi Mokoena",
  contact: "Thandi@Example.com",
  receivedOn: "2026-11-10",
  dueOn: "2026-12-10",
  details: "Asked what we hold about her.",
  notes: "",
};

const breachInput = {
  discoveredOn: "2026-11-12",
  summary: "The reception laptop was stolen.",
  dataInvolved: "Guests' names and phone numbers.",
  peopleAffected: "40",
  status: "ongoing",
  containedOn: "",
  regulatorToldOn: "",
  regulatorReference: "",
  peopleToldOn: "",
  peopleToldHow: "",
  actions: "",
};

/** Every audit entry, as text: what a reader of the activity log would see. */
const auditText = (events: { summary: string; details?: Record<string, unknown> }[]) => JSON.stringify(events.map((event) => [event.summary, event.details ?? {}]));

async function withGuest(harness: ReturnType<typeof privacyHarness>, status: "checked-out" | "checked-in" | "confirmed" = "checked-out") {
  await harness.fixtures.addGuest(
    { id: guestId, name: "Thandi Mokoena", phone: "+27821234567", email: "thandi@example.com", notes: "Prefers the ground floor.", createdAt: new Date("2026-01-01T08:00:00Z") },
    [{ id: bookingId, status, arrive: "2026-10-01", leave: "2026-10-03", notes: "Celebrating an anniversary" }],
  );
}

describe("the Information Officer", () => {
  it("is saved by the owner, checked like the form, and offered to the public notice without anything else", async () => {
    const { privacy, owner, audit } = privacyHarness();
    assert.equal(await privacy.officer(owner), null);
    assert.equal(await privacy.notice.informationOfficer(), null);
    const bad = await privacy.saveOfficer(owner, { name: "Nico Pretorius", email: "not an email", phone: "", registrationReference: "" });
    assert.equal(bad.ok, false);
    assert.deepEqual(await privacy.saveOfficer(owner, { name: "Nico Pretorius", email: " privacy@example.com ", phone: "082 123 4567", registrationReference: "IO-2026-1" }), { ok: true });
    assert.deepEqual(await privacy.notice.informationOfficer(), { name: "Nico Pretorius", email: "privacy@example.com", phone: "+27821234567", registrationReference: "IO-2026-1" });
    assert.equal((await privacy.overview(owner)).officer?.name, "Nico Pretorius");
    assert.ok(!auditText(audit.events).includes("Nico Pretorius"));
  });
});

describe("data-subject requests", () => {
  it("logs a request with the contact sealed to it, shown masked, and opened only on purpose (and logged)", async () => {
    const { privacy, owner, store, audit } = privacyHarness();
    const logged = await privacy.logRequest(owner, newRequest);
    assert.ok(logged.ok);
    const stored = await store.request(logged.id);
    assert.ok(stored?.contactSealed && !stored.contactSealed.includes("thandi@example.com"), "sealed");
    assert.equal(stored?.contactHint, "t•••@example.com");
    const shown = await privacy.request(owner, logged.id);
    assert.equal(shown?.request.contactHint, "t•••@example.com");
    assert.equal("contactSealed" in (shown?.request ?? {}), false, "never handed to a page");
    assert.deepEqual(await privacy.revealContact(owner, logged.id), { ok: true, contact: "thandi@example.com" });
    assert.deepEqual(
      audit.events.map((event) => event.action),
      ["privacy.request-logged", "privacy.request-contact-viewed"],
    );
    assert.ok(audit.events.every((event) => event.category === "privacy"));
    const text = auditText(audit.events);
    assert.ok(!text.includes("Thandi") && !text.includes("example.com"), "no name or contact in the log");
  });

  it("refuses a request received in the future or due before it arrived, and masks a phone number", async () => {
    const { privacy, owner, store } = privacyHarness();
    assert.deepEqual(await privacy.logRequest(owner, { ...newRequest, receivedOn: "2026-11-14", dueOn: "2026-12-01" }), { ok: false, errors: { receivedOn: "Choose today or an earlier day." } });
    const early = await privacy.logRequest(owner, { ...newRequest, dueOn: "2026-11-01" });
    assert.equal(early.ok, false);
    assert.ok(!early.ok && early.errors.dueOn);
    const phone = await privacy.logRequest(owner, { ...newRequest, contact: "082 123 4567" });
    assert.ok(phone.ok);
    assert.equal((await store.request(phone.id))?.contactHint, "Phone ending 4567");
    const none = await privacy.logRequest(owner, { ...newRequest, contact: "" });
    assert.ok(none.ok);
    assert.deepEqual(await privacy.revealContact(owner, none.id), { ok: false, errors: { form: "They didn't leave a contact." } });
  });

  it("lists open requests first, overdue before due soon, then closed ones", async () => {
    const { privacy, owner } = privacyHarness();
    const later = await privacy.logRequest(owner, { ...newRequest, dueOn: "2026-12-30" });
    const overdue = await privacy.logRequest(owner, { ...newRequest, receivedOn: "2026-10-01", dueOn: "2026-11-01" });
    const closed = await privacy.logRequest(owner, { ...newRequest, dueOn: "2026-11-20" });
    assert.ok(later.ok && overdue.ok && closed.ok);
    assert.deepEqual(await privacy.answerRequest(owner, closed.id, { closedOn: "2026-11-12", outcome: "Sent the export.", revision: "1" }), { ok: true });
    assert.deepEqual(
      (await privacy.requests(owner)).map((request) => request.id),
      [overdue.id, later.id, closed.id],
    );
    const overview = await privacy.overview(owner);
    assert.deepEqual([overview.requests.open, overview.requests.overdue, overview.requests.dueSoon], [2, 1, 0]);
  });

  it("moves a request from received to in progress to answered or refused, over the revision it was read at", async () => {
    const { privacy, owner } = privacyHarness();
    const first = await privacy.logRequest(owner, newRequest);
    assert.ok(first.ok);
    assert.deepEqual(await privacy.startRequest(owner, first.id, { revision: "1" }), { ok: true });
    assert.equal((await privacy.request(owner, first.id))?.request.status, "in-progress");
    assert.equal((await privacy.startRequest(owner, first.id, { revision: "2" })).ok, false, "only from received");
    assert.equal((await privacy.answerRequest(owner, first.id, { closedOn: "2026-11-12", outcome: "", revision: "1" })).ok, false, "stale revision");
    assert.deepEqual(await privacy.answerRequest(owner, first.id, { closedOn: "2026-11-14", outcome: "", revision: "2" }), { ok: false, errors: { closedOn: "Choose today or an earlier day." } });
    assert.deepEqual(await privacy.answerRequest(owner, first.id, { closedOn: "2026-11-13", outcome: "", revision: "2" }), { ok: true });
    assert.equal((await privacy.refuseRequest(owner, first.id, { closedOn: "2026-11-13", outcome: "Too late", revision: "3" })).ok, false, "closed already");

    const second = await privacy.logRequest(owner, { ...newRequest, kind: "deletion" });
    assert.ok(second.ok);
    const noReason = await privacy.refuseRequest(owner, second.id, { closedOn: "2026-11-13", outcome: "", revision: "1" });
    assert.ok(!noReason.ok && noReason.errors.outcome);
    assert.deepEqual(await privacy.refuseRequest(owner, second.id, { closedOn: "2026-11-13", outcome: "Their bookings are financial records SARS needs.", revision: "1" }), { ok: true });
    const refused = (await privacy.request(owner, second.id))?.request;
    assert.deepEqual([refused?.status, refused?.closedOn, refused?.outcome], ["refused", "2026-11-13", "Their bookings are financial records SARS needs."]);
  });

  it("changes what an open request is, and only the notes of a closed one", async () => {
    const { privacy, owner } = privacyHarness();
    const logged = await privacy.logRequest(owner, newRequest);
    assert.ok(logged.ok);
    assert.deepEqual(await privacy.changeRequest(owner, logged.id, { kind: "correction", dueOn: "2026-12-01", details: "Her email changed.", notes: "Called back.", revision: "1" }), { ok: true });
    assert.deepEqual(await privacy.confirmIdentity(owner, logged.id, { how: "Matched the phone number on her booking.", revision: "2" }), { ok: true });
    const changed = (await privacy.request(owner, logged.id))?.request;
    assert.deepEqual([changed?.kind, changed?.dueOn, changed?.identityConfirmedOn, changed?.revision], ["correction", "2026-12-01", "2026-11-13", 3]);
    assert.deepEqual(await privacy.answerRequest(owner, logged.id, { closedOn: "2026-11-13", outcome: "Corrected.", revision: "3" }), { ok: true });
    assert.deepEqual(await privacy.changeRequest(owner, logged.id, { kind: "correction", dueOn: "2026-12-05", details: "Her email changed.", notes: "Called back.", revision: "4" }), {
      ok: false,
      errors: { form: "This request is closed: only its notes can change." },
    });
    assert.deepEqual(await privacy.changeRequest(owner, logged.id, { kind: "correction", dueOn: "2026-12-01", details: "Her email changed.", notes: "She thanked us.", revision: "4" }), { ok: true });
  });
});

describe("a guest a request is about", () => {
  it("is found through the guest search, linked, and exported as a file of what's held, logged without their name", async () => {
    const harness = privacyHarness();
    const { privacy, owner, audit } = harness;
    await withGuest(harness);
    assert.deepEqual(await privacy.searchGuests(owner, "t"), [], "two characters at least");
    assert.deepEqual(
      (await privacy.searchGuests(owner, "4567")).map((guest) => guest.id),
      [guestId],
    );
    const logged = await privacy.logRequest(owner, newRequest);
    assert.ok(logged.ok);
    assert.deepEqual(await privacy.linkGuest(owner, logged.id, guestId), { ok: true });
    assert.equal((await privacy.request(owner, logged.id))?.guest?.guest.id, guestId);
    assert.equal((await privacy.linkGuest(owner, logged.id, "00000000-0000-4000-8000-00000000cfff")).ok, false);

    const file = await privacy.exportGuest(owner, guestId);
    assert.ok(file);
    assert.match(file.fileName, /^guest-record-00000000-2026-11-13\.csv$/);
    assert.ok(file.csv.includes("Guest record,Name,Thandi Mokoena"));
    assert.ok(file.csv.includes("Guest record,Email,thandi@example.com"));
    assert.ok(file.csv.includes("Room,Family room with shower"));
    assert.ok(file.csv.includes("Notes,Celebrating an anniversary"));
    assert.equal(await privacy.exportGuest(owner, "00000000-0000-4000-8000-00000000cfff"), null);
    assert.ok(!auditText(audit.events).includes("Thandi"));
    assert.ok(audit.events.some((event) => event.action === "privacy.guest-exported" && event.target?.id === guestId));
  });

  it("is anonymised on request after a named confirmation, once, keeping the booking", async () => {
    const harness = privacyHarness();
    const { privacy, owner, audit, fixtures } = harness;
    await withGuest(harness);
    assert.deepEqual(await privacy.anonymiseGuest(owner, guestId, { confirmName: "Someone else" }), {
      ok: false,
      errors: { form: "This guest's details changed since you opened the page. Reload it and check again." },
    });
    assert.deepEqual(await privacy.anonymiseGuest(owner, guestId, { confirmName: "Thandi Mokoena" }), { ok: true });
    const held = await privacy.guestRecord(owner, guestId);
    assert.equal(held?.guest.name, anonymisedGuestName);
    assert.deepEqual([held?.guest.phone, held?.guest.email, held?.guest.notes], [null, null, null]);
    assert.equal(held?.bookings.length, 1, "the booking stays");
    assert.equal(held?.bookings[0]?.notes, null, "its notes go");
    assert.ok(held?.anonymisedAt);
    assert.equal(held?.anonymiseBlocked, "This guest's record is already anonymised.");
    assert.equal((await privacy.anonymiseGuest(owner, guestId, { confirmName: anonymisedGuestName })).ok, false, "only once");
    assert.equal((await fixtures.guest(guestId))?.anonymised, true);
    assert.ok(!auditText(audit.events).includes("Thandi"));
  });

  it("isn't anonymised while a stay is booked or under way", async () => {
    for (const status of ["confirmed", "checked-in"] as const) {
      const harness = privacyHarness();
      await withGuest(harness, status);
      const held = await harness.privacy.guestRecord(harness.owner, guestId);
      assert.match(held?.anonymiseBlocked ?? "", /booked or under way/);
      assert.deepEqual(await harness.privacy.anonymiseGuest(harness.owner, guestId, { confirmName: "Thandi Mokoena" }), {
        ok: false,
        errors: { form: "They have a stay booked or under way. Anonymise them once it's checked out or cancelled." },
      });
      assert.equal((await harness.fixtures.guest(guestId))?.anonymised, false);
    }
  });
});

describe("the breach register", () => {
  it("records a breach, refusing future dates and a containment without its day, and changes it over its revision", async () => {
    const { privacy, owner, audit } = privacyHarness();
    assert.deepEqual(await privacy.recordBreach(owner, { ...breachInput, discoveredOn: "2026-11-14" }), { ok: false, errors: { discoveredOn: "Choose today or an earlier day." } });
    const noDay = await privacy.recordBreach(owner, { ...breachInput, status: "contained" });
    assert.ok(!noDay.ok && noDay.errors.containedOn);
    const recorded = await privacy.recordBreach(owner, breachInput);
    assert.ok(recorded.ok);
    const stored = await privacy.breach(owner, recorded.id);
    assert.deepEqual([stored?.peopleAffected, stored?.status, stored?.containedOn], [40, "ongoing", null]);
    const contained = { ...breachInput, status: "contained", containedOn: "2026-11-13", regulatorToldOn: "2026-11-13", regulatorReference: "SCN-1", peopleToldOn: "2026-11-13", peopleToldHow: "Email to each guest", revision: "1" };
    assert.deepEqual(await privacy.changeBreach(owner, recorded.id, contained), { ok: true });
    assert.equal((await privacy.changeBreach(owner, recorded.id, contained)).ok, false, "stale revision");
    assert.equal((await privacy.breach(owner, recorded.id))?.regulatorReference, "SCN-1");
    assert.deepEqual(
      audit.events.map((event) => event.summary),
      ["Recorded a breach discovered 12 Nov 2026 (ongoing)", "Breach discovered 12 Nov 2026: marked contained on 13 Nov 2026; Regulator told on 13 Nov 2026; people affected told on 13 Nov 2026"],
    );
    const overview = await privacy.overview(owner);
    assert.deepEqual([overview.breaches.total, overview.breaches.ongoing, overview.breaches.withSteps], [1, 0, 0]);
  });
});

describe("the retention schedule and its daily run", () => {
  async function withOldGuest(harness: ReturnType<typeof privacyHarness>) {
    await harness.fixtures.addGuest(
      { id: guestId, name: "Thandi Mokoena", phone: "+27821234567", email: "thandi@example.com", notes: null, createdAt: new Date("2017-01-01T08:00:00Z") },
      [{ id: bookingId, status: "checked-out", arrive: "2018-03-07", leave: "2018-03-10" }],
    );
    await harness.fixtures.addTask({ id: "task-1", doneAt: new Date("2025-01-01T08:00:00Z"), photoIds: ["photo-1", "photo-2"] });
  }

  it("previews what a run would do, and changes nothing until the owner confirms (each run kept and logged as counts)", async () => {
    const harness = privacyHarness();
    const { privacy, owner, audit, store, fixtures } = harness;
    await withOldGuest(harness);
    const view = await privacy.retention(owner);
    assert.deepEqual(view.preview.guests, { runs: false, count: 1, cutoff: "2019-11-13", period: 7, reason: "Waiting for you to confirm the period." });
    assert.equal(view.preview.taskPhotos.runs, false);
    assert.equal(view.preview.taskPhotos.count, 2);

    const report = await privacy.maintenance.runRetention();
    assert.deepEqual(report, {
      guestsAnonymised: 0,
      photosDeleted: 0,
      skipped: ["Guest records: Waiting for you to confirm the period.", "Task photos: Waiting for you to confirm the period."],
    });
    assert.equal((await fixtures.guest(guestId))?.anonymised, false);
    assert.equal((await store.runs(5)).length, 1);
    const entry = audit.events.at(-1);
    assert.deepEqual([entry?.actor, entry?.category, entry?.action, entry?.summary], [null, "privacy", "privacy.retention-run", "Retention run: 0 guest records anonymised, 0 task photos deleted"]);
  });

  it("applies the confirmed rules, once", async () => {
    const harness = privacyHarness();
    const { privacy, owner, fixtures, audit } = harness;
    await withOldGuest(harness);
    assert.deepEqual(await privacy.confirmPolicy(owner, "guest-records"), { ok: true });
    assert.deepEqual(await privacy.setPolicy(owner, "task-photos", { period: "6" }), { ok: true });
    const view = await privacy.retention(owner);
    assert.deepEqual([view.preview.guests.runs, view.preview.taskPhotos.runs], [true, true]);
    assert.equal(view.schedule[0]?.confirmed?.period, 7);

    assert.deepEqual(await privacy.maintenance.runRetention(), { guestsAnonymised: 1, photosDeleted: 2, skipped: [] });
    assert.equal((await fixtures.guest(guestId))?.name, anonymisedGuestName);
    assert.deepEqual(await fixtures.taskPhotos("task-1"), []);
    assert.deepEqual(await privacy.maintenance.runRetention(), { guestsAnonymised: 0, photosDeleted: 0, skipped: [] }, "idempotent");
    assert.ok(!auditText(audit.events).includes("Thandi"));
    assert.equal((await privacy.overview(owner)).retention.confirmed, 2);
  });

  it("keeps guest records at least SARS's verified record-keeping period, and sets none while it isn't verified", async () => {
    const harness = privacyHarness({ keeping: verifiedKeeping(5) });
    const { privacy, owner, state } = harness;
    const short = await privacy.setPolicy(owner, "guest-records", { period: "4" });
    assert.deepEqual(short, { ok: false, errors: { period: "Choose at least 5 years (SARS's record-keeping period) and at most 30 years." } });
    assert.deepEqual(await privacy.setPolicy(owner, "guest-records", { period: "5" }), { ok: true });
    assert.equal((await privacy.setPolicy(owner, "task-photos", { period: "0" })).ok, false);
    assert.equal((await privacy.setPolicy(owner, "audit-log", { period: "3" })).ok, false, "not set here");
    assert.deepEqual(await privacy.confirmPolicy(owner, "audit-log"), { ok: true });

    state.keeping = missingKeeping;
    const unverified = await privacy.setPolicy(owner, "guest-records", { period: "7" });
    assert.ok(!unverified.ok && /isn't verified/.test(unverified.errors.period ?? ""));
    assert.equal((await privacy.confirmPolicy(owner, "guest-records")).ok, false);
    const report = await privacy.maintenance.runRetention();
    assert.equal(report.guestsAnonymised, 0);
    assert.match(report.skipped[0] ?? "", /isn't verified/);

    state.keeping = verifiedKeeping(8);
    assert.equal((await privacy.confirmPolicy(owner, "guest-records")).ok, false, "below SARS's new period");
  });
});

describe("who may use privacy", () => {
  it("refuses admin, sales and staff every method, before touching anything", async () => {
    const { privacy, audit } = privacyHarness();
    for (const role of ["admin", "sales", "staff"] as const) {
      const who = actorWith(role);
      const calls: [string, () => Promise<unknown>][] = [
        ["overview", () => privacy.overview(who)],
        ["officer", () => privacy.officer(who)],
        ["saveOfficer", () => privacy.saveOfficer(who, {})],
        ["requests", () => privacy.requests(who)],
        ["request", () => privacy.request(who, "x")],
        ["logRequest", () => privacy.logRequest(who, newRequest)],
        ["changeRequest", () => privacy.changeRequest(who, "x", {})],
        ["startRequest", () => privacy.startRequest(who, "x", {})],
        ["answerRequest", () => privacy.answerRequest(who, "x", {})],
        ["refuseRequest", () => privacy.refuseRequest(who, "x", {})],
        ["confirmIdentity", () => privacy.confirmIdentity(who, "x", {})],
        ["linkGuest", () => privacy.linkGuest(who, "x", "y")],
        ["unlinkGuest", () => privacy.unlinkGuest(who, "x")],
        ["revealContact", () => privacy.revealContact(who, "x")],
        ["searchGuests", () => privacy.searchGuests(who, "Thandi")],
        ["guestRecord", () => privacy.guestRecord(who, "x")],
        ["exportGuest", () => privacy.exportGuest(who, "x")],
        ["anonymiseGuest", () => privacy.anonymiseGuest(who, "x", {})],
        ["breaches", () => privacy.breaches(who)],
        ["breach", () => privacy.breach(who, "x")],
        ["recordBreach", () => privacy.recordBreach(who, breachInput)],
        ["changeBreach", () => privacy.changeBreach(who, "x", {})],
        ["retention", () => privacy.retention(who)],
        ["setPolicy", () => privacy.setPolicy(who, "task-photos", { period: "6" })],
        ["confirmPolicy", () => privacy.confirmPolicy(who, "audit-log")],
      ];
      for (const [name, call] of calls) {
        await assert.rejects(call(), TestNotAllowed, `${role}: ${name}`);
      }
    }
    assert.equal(audit.events.length, 0, "nothing was recorded");
  });
});
