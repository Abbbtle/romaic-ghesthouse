import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { StaffStay } from "@/lib/reservations/reservation-service";
import { guestsLabel, staffStayRow } from "./today-labels";

describe("Today rows", () => {
  it("give staff only the name, the unit, the dates and the service notes, with no booking link", () => {
    const stay: StaffStay = { id: "b1", guestName: "Thandi Mokoena", unitName: "Unit 2", stay: { arrive: "2026-11-12", leave: "2026-11-15" }, status: "confirmed", serviceNotes: "Late arrival" };
    assert.deepEqual(staffStayRow(stay, "arriving"), {
      id: "b1",
      guestName: "Thandi Mokoena",
      unitName: "Unit 2",
      place: "Unit 2",
      when: "3 nights, leaving Sun 15 Nov",
      guests: null,
      serviceNotes: "Late arrival",
      href: null,
    });
    assert.equal(staffStayRow(stay, "staying").when, "Leaving Sun 15 Nov");
    assert.equal(staffStayRow(stay, "leaving").when, "Arrived Thu 12 Nov, 3 nights");
  });

  it("count guests in words", () => {
    assert.equal(guestsLabel(1, 0), "1 adult");
    assert.equal(guestsLabel(2, 1), "2 adults, 1 child");
    assert.equal(guestsLabel(2, 3), "2 adults, 3 children");
  });
});
