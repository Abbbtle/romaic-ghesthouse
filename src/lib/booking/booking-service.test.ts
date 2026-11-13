import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createInventoryService } from "@/lib/inventory/inventory-service";
import { testActor, testApartmentTypes, testInventoryAccess, TestNotAllowedError } from "@/lib/inventory/testing/harness";
import { createMemoryInventoryStore, memoryInventoryState } from "@/lib/inventory/testing/memory-store";
import { testBlock, testUnit } from "@/lib/inventory/testing/store-contract";
import type { Role } from "@/lib/kernel/actor";
import { memoryAuditRecorder } from "@/lib/kernel/audit";
import type { EmailMessage } from "@/lib/kernel/email";
import type { Clock } from "@/lib/kernel/ports";
import type { RateLimiter } from "@/lib/kernel/rate-limit";
import { createBookingService } from "./booking-service";
import type { BookingAccess, BookingPermission, FormTokens } from "./ports";
import { isRequestRef } from "./reference-codes";
import { formTokenFieldName, honeypotFieldName } from "./request-input";
import { createMemoryBookingStore } from "./testing/memory-store";

const grants: Record<Role, readonly BookingPermission[]> = {
  owner: ["bookings:view", "bookings:create", "bookings:cancel"],
  admin: [],
  sales: ["bookings:view", "bookings:create", "bookings:cancel"],
  staff: [],
};

const access: BookingAccess = {
  can: (actor, permission) => grants[actor.role].includes(permission),
  assertCan: (actor, permission) => {
    if (!grants[actor.role].includes(permission)) throw new TestNotAllowedError(permission);
  },
};

/** Tokens that are just the time, so a test can say when a form was shown. */
const plainTokens: FormTokens = {
  sign: (issuedAt) => `t:${issuedAt.getTime()}`,
  verify: (token) => (token.startsWith("t:") ? new Date(Number(token.slice(2))) : null),
};

function countingLimiter(max: number): RateLimiter & { used: Map<string, number> } {
  const used = new Map<string, number>();
  return {
    used,
    async tryConsume(key) {
      const next = (used.get(key) ?? 0) + 1;
      used.set(key, next);
      return next <= max;
    },
    async reset(key) {
      used.delete(key);
    },
  };
}

function harness({ perHour = 5, siteWide = 60, minimumNights }: { perHour?: number; siteWide?: number; minimumNights?: number } = {}) {
  let now = new Date("2026-11-12T08:00:00Z");
  const clock: Clock = { now: () => new Date(now) };
  const state = memoryInventoryState();
  const inventoryStore = createMemoryInventoryStore(state);
  const requests = createMemoryBookingStore(state);
  const audit = memoryAuditRecorder();
  const sent: EmailMessage[] = [];
  const problems: string[] = [];
  let next = 0;
  const inventory = createInventoryService({
    store: inventoryStore,
    apartmentTypes: async () => testApartmentTypes,
    clock,
    ids: { newId: () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}` },
    audit,
    access: testInventoryAccess,
    timeZone: "Africa/Johannesburg",
  });
  const service = createBookingService({
    requests,
    inventory,
    formTokens: plainTokens,
    limits: { perHour: countingLimiter(perHour), perDay: countingLimiter(20), siteWide: countingLimiter(siteWide) },
    random: { randomInt: (max) => (next++ * 7) % max },
    consentVersions: async () => ({ consent: "0.1", notice: "0.2" }),
    email: { send: async (message) => (sent.push(message), { ok: true }) },
    alertAddress: async () => "guesthouse@example.com",
    minimumNights: async () => minimumNights ?? null,
    runAfterResponse: (task) => void task(),
    reportProblem: (message) => problems.push(message),
    requestsPageUrl: "https://example.com/admin/requests",
    clock,
    ids: { newId: () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}` },
    audit,
    access,
  });
  return {
    service,
    requests,
    inventoryStore,
    audit,
    sent,
    problems,
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
    /** A form shown a minute ago. */
    form(fields: Record<string, string> = {}) {
      return {
        [formTokenFieldName]: plainTokens.sign(new Date(now.getTime() - 60_000)),
        [honeypotFieldName]: "",
        apartment: "family-shower",
        arrive: "2026-12-10",
        leave: "2026-12-13",
        adults: "2",
        children: "1",
        name: "Thandi Mokoena",
        phone: "082 123 4567",
        email: "",
        arrivalTime: "About 18:00",
        notes: "",
        consent: "on",
        ...fields,
      };
    },
  };
}

const visitor = { key: "visitor-1" };
const owner = testActor("owner");
const sales = testActor("sales");

describe("sending a booking request", () => {
  it("stores it waiting, with the consent versions, and alerts the guesthouse only", async () => {
    const { service, requests, sent, form } = harness();
    const result = await service.form.submit(form(), visitor);
    assert.equal(result.status, "sent");
    assert.ok(result.status === "sent" && isRequestRef(result.ref));
    const [stored] = await requests.waiting("2026-11-12", 10);
    assert.equal(stored?.phone, "+27821234567");
    assert.equal(stored?.apartmentName, "Family room with shower");
    assert.deepEqual(stored?.consent, { at: new Date("2026-11-12T08:00:00Z"), consentVersion: "0.1", noticeVersion: "0.2" });
    assert.equal(stored?.visitorKey, "visitor-1");
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.to, "guesthouse@example.com");
    assert.match(sent[0]!.text, /Stay: Thu 10 Dec to Sun 13 Dec 2026, 3 nights/);
    assert.doesNotMatch(sent[0]!.text, /About 18:00/, "details stay in the dashboard");
  });

  it("gives bots a believable receipt and stores nothing", async () => {
    const { service, requests, sent, form } = harness();
    const honeypot = await service.form.submit(form({ [honeypotFieldName]: "x" }), visitor);
    const tooFast = await service.form.submit(form({ [formTokenFieldName]: plainTokens.sign(new Date("2026-11-12T07:59:59Z")) }), visitor);
    for (const result of [honeypot, tooFast]) assert.equal(result.status, "sent");
    assert.equal(await requests.waitingCount("2026-11-12"), 0);
    assert.equal(sent.length, 0);
  });

  it("asks for a reload when the form is missing its token or is a day old", async () => {
    const { service, form } = harness();
    const stale = { status: "invalid", errors: { form: "This form has been open too long to send. Reload the page and try again." } };
    assert.deepEqual(await service.form.submit(form({ [formTokenFieldName]: "forged" }), visitor), stale);
    assert.deepEqual(await service.form.submit(form({ [formTokenFieldName]: plainTokens.sign(new Date("2026-11-11T07:00:00Z")) }), visitor), stale);
  });

  it("checks the fields, the dates and the consent", async () => {
    const { service, form } = harness();
    const result = await service.form.submit(form({ name: "", phone: "12", consent: "", arrive: "2026-11-01" }), visitor);
    assert.equal(result.status, "invalid");
    assert.deepEqual(Object.keys(result.status === "invalid" ? result.errors : {}).sort(), ["consent", "name", "phone"]);
    const past = await service.form.submit(form({ arrive: "2026-11-01" }), visitor);
    assert.deepEqual(past, { status: "invalid", errors: { arrive: "Choose an arrival day from today onwards." } });
  });

  it("re-checks availability on the server: too small, full, or no longer offered", async () => {
    const { service, inventoryStore, form } = harness();
    assert.deepEqual(await service.form.submit(form({ apartment: "deluxe-double-bath" }), visitor), { status: "unavailable", reason: "too-small" });
    assert.deepEqual(await service.form.submit(form({ apartment: "hidden-suite" }), visitor), { status: "unavailable", reason: "unknown-apartment" });
    await inventoryStore.addUnit(testUnit("u1", "Unit 1"), { maxUnits: 10 });
    await inventoryStore.addBlock(testBlock("b1", "u1", "2026-12-12", "2026-12-14"));
    assert.deepEqual(await service.form.submit(form(), visitor), { status: "unavailable", reason: "full" });
  });

  it("refuses a stay shorter than the rates' minimum, even when posted directly", async () => {
    const { service, inventoryStore, form } = harness({ minimumNights: 4 });
    await inventoryStore.addUnit(testUnit("u1", "Unit 1"), { maxUnits: 10 });
    assert.deepEqual(await service.form.submit(form(), visitor), {
      status: "invalid",
      errors: { form: "Stays on these dates are at least 4 nights. Go back and choose a later leaving day." },
    });
    assert.equal((await service.form.submit(form({ leave: "2026-12-14" }), visitor)).status, "sent");
  });

  it("limits each visitor, each phone and duplicates", async () => {
    const { service, form } = harness({ perHour: 4 });
    assert.equal((await service.form.submit(form(), visitor)).status, "sent");
    assert.deepEqual(await service.form.submit(form({ arrive: "2026-12-11" }), visitor), {
      status: "invalid",
      errors: { form: "We can't take another request from this number online. Please WhatsApp or call us and we'll help." },
    });
    assert.equal((await service.form.submit(form({ arrive: "2027-01-10", leave: "2027-01-11" }), visitor)).status, "sent");
    assert.equal((await service.form.submit(form({ arrive: "2027-02-10", leave: "2027-02-11" }), visitor)).status, "sent");
    assert.deepEqual(await service.form.submit(form({ arrive: "2027-03-10", leave: "2027-03-11" }), visitor), { status: "rate-limited" });
  });
});

describe("deciding a request", () => {
  async function waitingRequest() {
    const h = harness();
    await h.inventoryStore.addUnit(testUnit("u1", "Unit 1"), { maxUnits: 10 });
    await h.inventoryStore.addUnit(testUnit("u2", "Unit 2"), { maxUnits: 10 });
    await h.service.form.submit(h.form(), visitor);
    const [request] = await h.service.inbox.waiting(owner);
    return { ...h, request: request! };
  }

  it("declines a waiting request with a private note, once", async () => {
    const { service, request } = await waitingRequest();
    assert.deepEqual(await service.decisions.decline(sales, request.id, { note: "Full that week" }), { ok: true });
    assert.equal((await service.inbox.handled(owner))[0]?.decision?.note, "Full that week");
    assert.deepEqual(await service.decisions.decline(owner, request.id, {}), {
      ok: false,
      errors: { form: "This request was already handled, or it has expired. Reload the page." },
    });
  });

  it("refuses admin and staff the inbox and every decision", async () => {
    const { service, request } = await waitingRequest();
    for (const role of ["admin", "staff"] as const) {
      const actor = testActor(role);
      await assert.rejects(service.inbox.waiting(actor), TestNotAllowedError);
      await assert.rejects(service.inbox.handled(actor), TestNotAllowedError);
      await assert.rejects(service.inbox.request(actor, request.id), TestNotAllowedError);
      await assert.rejects(service.decisions.decline(actor, request.id, {}), TestNotAllowedError);
      assert.equal(await service.inbox.waitingCount(actor), 0);
    }
  });

  it("expires a request that's still waiting on its arrival day", async () => {
    const { service, request, advance } = await waitingRequest();
    advance(30 * 24 * 60 * 60 * 1000);
    assert.deepEqual(await service.inbox.waiting(owner), []);
    assert.equal((await service.inbox.request(owner, request.id))?.status, "expired");
    assert.deepEqual(await service.maintenance.housekeeping(), { expired: 1, deleted: 0, visitorKeysForgotten: 1 });
  });
});
