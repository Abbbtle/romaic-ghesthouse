import { createMemoryInventoryStore, memoryInventoryState } from "@/lib/inventory/testing/memory-store";
import { testUnit } from "@/lib/inventory/testing/store-contract";
import type { Actor, Role } from "@/lib/kernel/actor";
import { memoryAuditRecorder } from "@/lib/kernel/audit";
import { sequentialIds, type Clock } from "@/lib/kernel/ports";
import { createChannelService } from "../channel-service";
import type { ChannelAccess, ChannelManager, ChannelPermission, FetchedCalendar, FeedTokens, SecretVault } from "../ports";
import { createMemoryChannelStore } from "./memory-store";

/** What the test access check throws, standing in for the accounts core's NotAllowedError. */
export class TestNotAllowedError extends Error {
  constructor(readonly permission: string) {
    super(`Not allowed: ${permission}`);
    this.name = "TestNotAllowedError";
  }
}

/** Channel permissions per role, as roles.md grants them (src/lib/accounts/access.test.ts checks the real matrix). */
const grants: Record<Role, readonly ChannelPermission[]> = {
  owner: ["channels:status", "channels:configure"],
  admin: ["channels:status", "channels:configure"],
  sales: ["channels:status"],
  staff: [],
};

export const testChannelAccess: ChannelAccess = {
  can: (actor, permission) => grants[actor.role].includes(permission),
  assertCan: (actor, permission) => {
    if (!grants[actor.role].includes(permission)) throw new TestNotAllowedError(permission);
  },
};

export function testActor(role: Role): Actor {
  return { id: `00000000-0000-4000-8000-0000000000${role === "owner" ? "a1" : role === "admin" ? "a2" : role === "sales" ? "a3" : "a4"}`, role, name: `Test ${role}` };
}

/** A vault that "seals" by wrapping, and refuses to open a value under another context, like the real cipher. */
export const testVault: SecretVault = {
  seal: (secret, context) => `sealed:${context}:${Buffer.from(secret).toString("base64")}`,
  open: (sealed, context) => {
    const prefix = `sealed:${context}:`;
    if (!sealed.startsWith(prefix)) throw new Error("Wrong context");
    return Buffer.from(sealed.slice(prefix.length), "base64").toString();
  },
};

/** Feed tokens "token-1", "token-2", … hashed by wrapping. */
export function testTokens(): FeedTokens {
  let next = 1;
  return { newToken: () => `token-${next++}`, hash: (token) => `hash:${token}` };
}

/** A calendar as channels publish one, with CRLF lines and all-day events. */
export function icalText(events: readonly { uid: string; arrive: string; leave: string }[]): string {
  const date = (iso: string) => iso.replaceAll("-", "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Test channel//EN",
    ...events.flatMap((event) => ["BEGIN:VEVENT", `UID:${event.uid}`, `DTSTART;VALUE=DATE:${date(event.arrive)}`, `DTEND;VALUE=DATE:${date(event.leave)}`, "SUMMARY:CLOSED - Not available", "END:VEVENT"]),
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

type Answer = FetchedCalendar | (() => FetchedCalendar | Promise<FetchedCalendar>);

/** A ChannelManager answering per URL, keeping each request's URL and conditions. No network. */
export function fakeChannelManager() {
  const answers = new Map<string, Answer>();
  const requests: { url: string; etag: string | null; lastModified: string | null }[] = [];
  const manager: ChannelManager = {
    async fetchCalendar(url, conditions) {
      requests.push({ url, ...conditions });
      const answer = answers.get(url);
      if (!answer) return { status: "failed", reason: "The channel's calendar couldn't be reached. It will be tried again at the next sync." };
      return typeof answer === "function" ? answer() : answer;
    },
  };
  return {
    manager,
    requests,
    answer(url: string, answer: Answer) {
      answers.set(url, answer);
    },
    serve(url: string, events: readonly { uid: string; arrive: string; leave: string }[], etag: string | null = null) {
      answers.set(url, { status: "fetched", text: icalText(events), etag, lastModified: null });
    },
  };
}

export const unit1 = "00000000-0000-4000-8000-00000000c0a1";
export const unit2 = "00000000-0000-4000-8000-00000000c0b2";

/** A channel service on memory stores with two units, at 10:00 SAST on Thursday 12 November 2026. */
export async function channelHarness(options: { now?: string } = {}) {
  const state = memoryInventoryState();
  const inventory = createMemoryInventoryStore(state);
  await inventory.addUnit(testUnit(unit1, "Unit 1"), { maxUnits: 10 });
  await inventory.addUnit(testUnit(unit2, "Unit 2"), { maxUnits: 10 });
  const store = createMemoryChannelStore(state);
  const audit = memoryAuditRecorder();
  const fake = fakeChannelManager();
  let now = new Date(options.now ?? "2026-11-12T08:00:00Z");
  const clock: Clock = { now: () => new Date(now) };
  const service = createChannelService({
    store,
    inventory,
    manager: fake.manager,
    vault: testVault,
    tokens: testTokens(),
    clock,
    ids: sequentialIds("id"),
    audit,
    access: testChannelAccess,
    timeZone: "Africa/Johannesburg",
  });
  return {
    state,
    inventory,
    store,
    audit,
    fake,
    service,
    setNow(instant: string) {
      now = new Date(instant);
    },
  };
}
