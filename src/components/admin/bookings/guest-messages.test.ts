import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSection } from "@/lib/content/schema";
import { sampleContent } from "@/lib/content/testing/sample-content";
import { testBooking, testGuest } from "@/lib/reservations/testing/store-contract";
import { guestMessages } from "./guest-messages";

describe("a booking's WhatsApp messages", () => {
  it("fill in the booking's and the business's details, linked to the guest's number", () => {
    const booking = { ...testBooking("b1", "g1"), guest: testGuest("g1") };
    const [confirmation, directions, checkIn] = guestMessages(booking, sampleContent(), "Family room");
    assert.equal(confirmation?.text, "Hi Thandi, booking RG-B2C3D is confirmed.");
    assert.equal(directions?.text, "We're at 1 Test Street, Testville, Sampleton.");
    assert.equal(checkIn?.text, "Check-in from 14:00.");
    assert.match(confirmation?.href ?? "", /^https:\/\/wa\.me\/27821234567\?text=Hi%20Thandi/);
  });

  it("fill in the room, and still fill in {apartment} from messages saved before it was renamed {room}", () => {
    const booking = { ...testBooking("b1", "g1"), guest: testGuest("g1") };
    const content = sampleContent();
    content.messages.confirmation = "Your {room} is ready.";
    content.messages.directions = "Your {apartment} is ready.";
    assert.equal(parseSection("messages", content.messages).ok, true, "both still save");
    const [confirmation, directions] = guestMessages(booking, content, "Family room with shower");
    assert.equal(confirmation?.text, "Your Family room with shower is ready.");
    assert.equal(directions?.text, "Your Family room with shower is ready.");
  });

  it("suggest {room}, never {apartment}, when a message uses a placeholder it can't fill in", () => {
    const content = sampleContent();
    content.messages.confirmation = "Your {flat} is ready.";
    const parsed = parseSection("messages", content.messages);
    assert.equal(parsed.ok, false);
    const message = parsed.ok ? "" : Object.values(parsed.errors).join(" ");
    assert.match(message, /\{room\}/);
    assert.doesNotMatch(message, /apartment/i);
  });

  it("offer no link when the guest has no phone", () => {
    const booking = { ...testBooking("b1", "g1"), guest: testGuest("g1", { phone: null }) };
    assert.equal(guestMessages(booking, sampleContent(), "Family room")[0]?.href, null);
  });
});
