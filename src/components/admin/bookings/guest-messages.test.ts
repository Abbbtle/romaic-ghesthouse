import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleContent } from "@/lib/content/testing/sample-content";
import { testBooking, testGuest } from "@/lib/reservations/testing/store-contract";
import { guestMessages } from "./guest-messages";

describe("a booking's WhatsApp messages", () => {
  it("fill in the booking's and the business's details, linked to the guest's number", () => {
    const booking = { ...testBooking("b1", "g1"), guest: testGuest("g1") };
    const [confirmation, directions, checkIn] = guestMessages(booking, sampleContent(), "Family apartment");
    assert.equal(confirmation?.text, "Hi Thandi, booking RG-B2C3D is confirmed.");
    assert.equal(directions?.text, "We're at 1 Test Street, Testville, Sampleton.");
    assert.equal(checkIn?.text, "Check-in from 14:00.");
    assert.match(confirmation?.href ?? "", /^https:\/\/wa\.me\/27821234567\?text=Hi%20Thandi/);
  });

  it("offer no link when the guest has no phone", () => {
    const booking = { ...testBooking("b1", "g1"), guest: testGuest("g1", { phone: null }) };
    assert.equal(guestMessages(booking, sampleContent(), "Family apartment")[0]?.href, null);
  });
});
