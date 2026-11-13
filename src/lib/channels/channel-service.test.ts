import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { testBlock } from "@/lib/inventory/testing/store-contract";
import { syncMessage } from "./sync-message";
import { channelHarness, testActor, TestNotAllowedError, unit1, unit2 } from "./testing/harness";

const owner = testActor("owner");
const admin = testActor("admin");
const sales = testActor("sales");
const staff = testActor("staff");

const secretLink = "https://admin.booking.com/hotel/hoteladmin/ical.html?t=s3cr3t-calendar-token";
const otherLink = "https://www.airbnb.co.za/calendar/ical/123.ics?s=another-secret";

async function withCalendar(url = secretLink, unitId = unit1, channel = "booking-com") {
  const harness = await channelHarness();
  const added = await harness.service.addCalendar(owner, { unitId, channel, url });
  assert.ok(added.ok, JSON.stringify(added));
  return { ...harness, calendarId: added.id };
}

const blocksOf = async (harness: Awaited<ReturnType<typeof channelHarness>>, unitId = unit1) =>
  (await harness.inventory.blocksOverlapping({ arrive: "2026-11-01", leave: "2027-12-31" }))
    .filter((block) => block.unitId === unitId)
    .map((block) => [block.reason, block.stay.arrive, block.stay.leave])
    .sort((a, b) => String(a[1]).localeCompare(String(b[1])));

describe("channel calendars", () => {
  it("are kept per unit and channel, from the channels' own https links only", async () => {
    const { service, store, calendarId } = await withCalendar();
    assert.equal((await store.calendar(calendarId))?.host, "admin.booking.com");
    const duplicate = await service.addCalendar(owner, { unitId: unit1, channel: "booking-com", url: secretLink });
    assert.equal(duplicate.ok, false);
    for (const url of ["http://admin.booking.com/ical", "https://evil.example/booking.com.ics", "https://10.0.0.5/ical", "https://user:pw@admin.booking.com/x", "https://admin.booking.com:8443/x", "not a link"]) {
      const refused = await service.addCalendar(owner, { unitId: unit2, channel: "booking-com", url });
      assert.equal(refused.ok, false, url);
      assert.ok(!refused.ok && refused.errors.url, url);
    }
  });

  it("keep the link sealed to their own id, and a new link forgets the last fetch's validators", async () => {
    const { service, store, fake, calendarId } = await withCalendar();
    const sealed = await store.sealedUrl(calendarId);
    assert.ok(sealed && !sealed.includes("s3cr3t"));
    fake.serve(secretLink, [], '"v1"');
    await service.syncNow(owner, calendarId);
    assert.equal((await store.calendar(calendarId))?.etag, '"v1"');
    const changed = await service.changeCalendarUrl(owner, calendarId, { url: "https://ical.booking.com/v1/export?t=new-secret" });
    assert.ok(changed.ok);
    const calendar = await store.calendar(calendarId);
    assert.deepEqual([calendar?.host, calendar?.etag], ["ical.booking.com", null]);
  });
});

describe("syncing a channel calendar", () => {
  it("imports new stays as channel blocks, and a stay on nights already taken as a conflict holding nothing", async () => {
    const harness = await withCalendar();
    await harness.inventory.addBlock({ ...testBlock("owner-block", unit1, "2026-12-20", "2026-12-22", "owner"), createdBy: owner.id });
    harness.fake.serve(secretLink, [
      { uid: "a@booking.com", arrive: "2026-12-10", leave: "2026-12-13" },
      { uid: "b@booking.com", arrive: "2026-12-21", leave: "2026-12-23" },
    ]);
    const result = await harness.service.syncNow(sales, harness.calendarId);
    assert.ok(result.ok);
    assert.deepEqual(result.summaries[0], { calendarId: harness.calendarId, outcome: "ok", added: 2, changed: 0, removed: 0, conflicts: 1, error: null });
    assert.deepEqual(await blocksOf(harness), [
      ["channel", "2026-12-10", "2026-12-13"],
      ["owner", "2026-12-20", "2026-12-22"],
    ]);
    const overview = await harness.service.overview(sales);
    assert.deepEqual(
      overview.attention.map((event) => [event.uid, event.status, event.unitName, event.channelName]),
      [["b@booking.com", "conflict", "Unit 1", "Booking.com"]],
    );
    assert.equal(overview.calendars[0]?.lastStatus, "ok");
    assert.equal(overview.calendars[0]?.lastRun?.added, 2);
  });

  it("moves a stay's block with its dates, removes a stay that's gone, and skips stays already over", async () => {
    const harness = await withCalendar();
    harness.fake.serve(secretLink, [
      { uid: "a@booking.com", arrive: "2026-12-10", leave: "2026-12-13" },
      { uid: "past@booking.com", arrive: "2026-11-01", leave: "2026-11-05" },
    ]);
    await harness.service.syncNow(owner, harness.calendarId);
    assert.deepEqual((await harness.store.events(harness.calendarId)).map((event) => event.uid), ["a@booking.com"]);

    harness.fake.serve(secretLink, [{ uid: "a@booking.com", arrive: "2026-12-11", leave: "2026-12-14" }]);
    const moved = await harness.service.syncNow(owner, harness.calendarId);
    assert.ok(moved.ok);
    assert.equal(moved.summaries[0]?.changed, 1);
    assert.deepEqual(await blocksOf(harness), [["channel", "2026-12-11", "2026-12-14"]]);

    harness.fake.serve(secretLink, []);
    const removed = await harness.service.syncNow(owner, harness.calendarId);
    assert.ok(removed.ok);
    assert.equal(removed.summaries[0]?.removed, 1);
    assert.deepEqual(await blocksOf(harness), []);
    assert.deepEqual(await harness.store.events(harness.calendarId), []);
  });

  it("tries a conflict again each time, so it holds its nights once they're free", async () => {
    const harness = await withCalendar();
    await harness.inventory.addBlock({ ...testBlock("maintenance", unit1, "2026-12-10", "2026-12-12", "maintenance"), createdBy: owner.id });
    harness.fake.serve(secretLink, [{ uid: "a@booking.com", arrive: "2026-12-10", leave: "2026-12-13" }]);
    await harness.service.syncNow(owner, harness.calendarId);
    assert.equal((await harness.store.events(harness.calendarId))[0]?.status, "conflict");
    assert.ok(await harness.inventory.removeManualBlock("maintenance"));
    await harness.service.syncNow(owner, harness.calendarId);
    assert.equal((await harness.store.events(harness.calendarId))[0]?.status, "placeholder");
    assert.deepEqual(await blocksOf(harness), [["channel", "2026-12-10", "2026-12-13"]]);
  });

  it("never touches a linked stay's booking: it flags changed dates and a stay gone from the channel", async () => {
    const harness = await withCalendar();
    harness.fake.serve(secretLink, [{ uid: "a@booking.com", arrive: "2026-12-10", leave: "2026-12-13" }]);
    await harness.service.syncNow(owner, harness.calendarId);
    const [event] = await harness.store.events(harness.calendarId);
    assert.ok(event);
    // Sales completes it as a booking: the booking holds the nights now.
    harness.store.link(event.id, "booking-1");
    await harness.inventory.addBlock({ ...testBlock("booking-block", unit1, "2026-12-10", "2026-12-13", "booking"), bookingId: "booking-1" });

    harness.fake.serve(secretLink, [{ uid: "a@booking.com", arrive: "2026-12-11", leave: "2026-12-14" }]);
    await harness.service.syncNow(owner, harness.calendarId);
    let stored = (await harness.store.events(harness.calendarId))[0];
    assert.equal(stored?.status, "linked");
    assert.deepEqual(stored?.stay, { arrive: "2026-12-10", leave: "2026-12-13" });
    assert.match(stored?.note ?? "", /^Dates changed on Booking\.com: now Fri 11 Dec to Mon 14 Dec 2026, 3 nights\. Check the booking\.$/);
    assert.deepEqual(await blocksOf(harness), [["booking", "2026-12-10", "2026-12-13"]]);
    assert.equal((await harness.service.overview(owner)).attention.length, 1);

    harness.fake.serve(secretLink, []);
    await harness.service.syncNow(owner, harness.calendarId);
    stored = (await harness.store.events(harness.calendarId))[0];
    assert.equal(stored?.status, "gone");
    assert.equal(stored?.bookingId, "booking-1");
    assert.match(stored?.note ?? "", /No longer on Booking\.com's calendar: cancelled there\?/);
    assert.deepEqual(await blocksOf(harness), [["booking", "2026-12-10", "2026-12-13"]]);

    harness.fake.serve(secretLink, [{ uid: "a@booking.com", arrive: "2026-12-10", leave: "2026-12-13" }]);
    await harness.service.syncNow(owner, harness.calendarId);
    stored = (await harness.store.events(harness.calendarId))[0];
    assert.deepEqual([stored?.status, stored?.note], ["linked", null]);
    assert.deepEqual((await harness.service.overview(owner)).attention, []);
  });

  it("fetches conditionally, and an unchanged calendar changes nothing", async () => {
    const harness = await withCalendar();
    harness.fake.serve(secretLink, [{ uid: "a@booking.com", arrive: "2026-12-10", leave: "2026-12-13" }], '"v1"');
    await harness.service.syncNow(owner, harness.calendarId);
    harness.fake.answer(secretLink, { status: "not-modified" });
    const again = await harness.service.syncNow(owner, harness.calendarId);
    assert.ok(again.ok);
    assert.equal(again.summaries[0]?.outcome, "not-modified");
    assert.deepEqual(harness.fake.requests.map((request) => request.etag), [null, '"v1"']);
    assert.equal((await harness.store.events(harness.calendarId)).length, 1);
    assert.equal((await harness.store.calendar(harness.calendarId))?.lastStatus, "ok");
  });

  it("records a failure on its calendar and keeps the stays it had, and one failing never stops the others", async () => {
    const harness = await withCalendar();
    const second = await harness.service.addCalendar(owner, { unitId: unit2, channel: "booking-com", url: "https://admin.booking.com/second.ics" });
    const third = await harness.service.addCalendar(owner, { unitId: unit2, channel: "airbnb", url: otherLink });
    assert.ok(second.ok && third.ok);
    await harness.service.updateChannel(owner, "airbnb", { name: "Airbnb", active: true });
    harness.fake.serve(secretLink, [{ uid: "a@booking.com", arrive: "2026-12-10", leave: "2026-12-13" }]);
    await harness.service.syncNow(owner, harness.calendarId);

    harness.fake.answer(secretLink, { status: "failed", reason: "The channel took too long to answer. It will be tried again at the next sync." });
    harness.fake.answer("https://admin.booking.com/second.ics", () => {
      throw new Error("The adapter broke");
    });
    harness.fake.serve(otherLink, [{ uid: "x@airbnb.com", arrive: "2026-12-20", leave: "2026-12-22" }]);
    const summaries = await harness.service.syncAll();
    assert.deepEqual(
      summaries.map((summary) => [summary.calendarId, summary.outcome]),
      [
        [harness.calendarId, "error"],
        [second.id, "error"],
        [third.id, "ok"],
      ],
    );
    const first = await harness.store.calendar(harness.calendarId);
    assert.deepEqual([first?.lastStatus, first?.lastError], ["error", "The channel took too long to answer. It will be tried again at the next sync."]);
    assert.equal((await harness.store.calendar(second.id))?.lastStatus, "error");
    assert.equal((await harness.store.events(harness.calendarId)).length, 1, "stays kept");
    assert.deepEqual(await blocksOf(harness, unit2), [["channel", "2026-12-20", "2026-12-22"]]);
  });

  it("reads a page that isn't a calendar as a failure, never as no stays", async () => {
    const harness = await withCalendar();
    harness.fake.serve(secretLink, [{ uid: "a@booking.com", arrive: "2026-12-10", leave: "2026-12-13" }]);
    await harness.service.syncNow(owner, harness.calendarId);
    harness.fake.answer(secretLink, { status: "fetched", text: "<html>Sign in</html>", etag: null, lastModified: null });
    const result = await harness.service.syncNow(owner, harness.calendarId);
    assert.ok(result.ok);
    assert.equal(result.summaries[0]?.outcome, "error");
    assert.equal((await harness.store.events(harness.calendarId)).length, 1);
  });

  it("syncs only the calendars of channels that are on", async () => {
    const harness = await withCalendar(otherLink, unit1, "airbnb");
    assert.deepEqual(await harness.service.syncAll(), []);
    assert.deepEqual(harness.fake.requests, []);
  });

  it("removes a calendar with its stays and the nights they held", async () => {
    const harness = await withCalendar();
    harness.fake.serve(secretLink, [{ uid: "a@booking.com", arrive: "2026-12-10", leave: "2026-12-13" }]);
    await harness.service.syncNow(owner, harness.calendarId);
    const removed = await harness.service.removeCalendar(admin, harness.calendarId);
    assert.ok(removed.ok);
    assert.deepEqual(await blocksOf(harness), []);
    assert.equal(await harness.store.calendar(harness.calendarId), null);
  });
});

describe("unit feeds", () => {
  it("list a unit's busy nights as Not available, leaving out the asking channel's own stays", async () => {
    const harness = await withCalendar();
    await harness.inventory.addBlock({ ...testBlock("held-1", unit1, "2026-12-20", "2026-12-22", "owner"), note: "Family visiting", createdBy: owner.id });
    harness.fake.serve(secretLink, [{ uid: "a@booking.com", arrive: "2026-12-10", leave: "2026-12-13" }]);
    await harness.service.syncNow(owner, harness.calendarId);
    assert.ok((await harness.service.resetFeed(owner, unit1)).ok);
    const [feed] = (await harness.service.feeds(owner)).filter((candidate) => candidate.unitId === unit1);
    assert.equal(feed?.token, "token-1");

    const everything = await harness.service.feedIcs("token-1", null);
    assert.ok(everything);
    assert.equal(everything.match(/BEGIN:VEVENT/g)?.length, 2);
    assert.match(everything, /DTSTART;VALUE=DATE:20261210\r\nDTEND;VALUE=DATE:20261213/);
    assert.equal(everything.match(/SUMMARY:Not available/g)?.length, 2);
    assert.doesNotMatch(everything, /Family visiting|Booking\.com stay|owner|channel/i);

    const forBooking = await harness.service.feedIcs("token-1", "booking-com");
    assert.equal(forBooking?.match(/BEGIN:VEVENT/g)?.length, 1);
    assert.match(forBooking ?? "", /DTSTART;VALUE=DATE:20261220/);
    assert.equal((await harness.service.feedIcs("token-1", "airbnb"))?.match(/BEGIN:VEVENT/g)?.length, 2);
    assert.equal(await harness.service.feedIcs("nobody's-token", null), null);
  });

  it("are replaced by a reset: the old link stops working at once", async () => {
    const { service } = await channelHarness();
    await service.resetFeed(owner, unit1);
    await service.resetFeed(admin, unit1);
    assert.equal(await service.feedIcs("token-1", null), null);
    assert.ok(await service.feedIcs("token-2", null));
    assert.equal((await service.resetFeed(owner, "00000000-0000-4000-8000-0000000000ff")).ok, false);
  });
});

describe("channel permissions", () => {
  it("let owner, admin and sales see the status and sync, and never staff", async () => {
    const { service, calendarId } = await withCalendar();
    for (const actor of [owner, admin, sales]) {
      await service.overview(actor);
      assert.ok((await service.syncNow(actor, calendarId)).ok);
      assert.ok((await service.syncNow(actor, null)).ok);
    }
    await assert.rejects(service.overview(staff), TestNotAllowedError);
    await assert.rejects(service.syncNow(staff, calendarId), TestNotAllowedError);
    await assert.rejects(service.syncNow(staff, null), TestNotAllowedError);
  });

  it("let only the owner and admin change links, channels and feeds: never sales or staff", async () => {
    const { service, calendarId } = await withCalendar();
    for (const actor of [sales, staff]) {
      await assert.rejects(service.feeds(actor), TestNotAllowedError);
      await assert.rejects(service.resetFeed(actor, unit1), TestNotAllowedError);
      await assert.rejects(service.addCalendar(actor, { unitId: unit2, channel: "booking-com", url: secretLink }), TestNotAllowedError);
      await assert.rejects(service.changeCalendarUrl(actor, calendarId, { url: secretLink }), TestNotAllowedError);
      await assert.rejects(service.removeCalendar(actor, calendarId), TestNotAllowedError);
      await assert.rejects(service.updateChannel(actor, "airbnb", { name: "Airbnb", active: true }), TestNotAllowedError);
    }
    for (const actor of [owner, admin]) {
      await service.feeds(actor);
      assert.ok((await service.updateChannel(actor, "airbnb", { name: "Airbnb", active: true })).ok);
    }
  });
});

describe("the audit log", () => {
  it("records every change under channels, never with a calendar link or feed token", async () => {
    const { service, audit, calendarId, fake } = await withCalendar();
    await service.changeCalendarUrl(owner, calendarId, { url: "https://ical.booking.com/export?t=second-secret" });
    await service.resetFeed(owner, unit1);
    await service.resetFeed(owner, unit1);
    await service.updateChannel(owner, "airbnb", { name: "Airbnb", active: true });
    fake.serve("https://ical.booking.com/export?t=second-secret", []);
    await service.syncNow(owner, calendarId);
    await service.removeCalendar(owner, calendarId);
    assert.deepEqual(
      audit.events.map((event) => [event.category, event.action]),
      [
        ["channels", "channels.calendar-added"],
        ["channels", "channels.calendar-changed"],
        ["channels", "channels.feed-created"],
        ["channels", "channels.feed-reset"],
        ["channels", "channels.channel-changed"],
        ["channels", "channels.calendar-removed"],
      ],
    );
    assert.equal(audit.events[0]?.summary, "Added the Booking.com calendar for Unit 1 (admin.booking.com)");
    const logged = JSON.stringify(audit.events);
    for (const secret of ["s3cr3t", "second-secret", "token-1", "token-2", "https://"]) assert.ok(!logged.includes(secret), secret);
  });
});

describe("the Sync now message", () => {
  const summary = (outcome: "ok" | "not-modified" | "error", added = 0, conflicts = 0, error: string | null = null) => ({ calendarId: "c", outcome, added, changed: 0, removed: 0, conflicts, error });

  it("says what came in, what needs a look and what couldn't be read", () => {
    assert.deepEqual(syncMessage([]), { message: "There are no calendars to sync: add a channel's calendar link first.", problem: false });
    assert.deepEqual(syncMessage([summary("ok", 2, 1)]), { message: "Synced: 2 new stays. 1 stay needs a look: see Needs attention.", problem: false });
    assert.deepEqual(syncMessage([summary("not-modified")]), { message: "Synced: nothing new.", problem: false });
    assert.deepEqual(syncMessage([summary("error", 0, 0, "The channel took too long to answer.")]), { message: "The channel took too long to answer.", problem: true });
    assert.deepEqual(syncMessage([summary("ok", 1), summary("error", 0, 0, "x")]), { message: "Synced 1 calendar: 1 new stay. 1 calendar couldn't be read: see below.", problem: true });
  });
});
