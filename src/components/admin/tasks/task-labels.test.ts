import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TaskView } from "@/lib/tasks/task-service";
import { dueLabel, taskCardOf } from "./task-labels";

const view: TaskView = {
  id: "t1",
  kind: "housekeeping",
  unitId: "u1",
  unitName: "Unit 1",
  title: "Clean Unit 1 after Thandi",
  notes: null,
  status: "open",
  priority: "normal",
  assignedTo: null,
  assigneeName: null,
  dueOn: "2026-11-12",
  overdue: false,
  mine: false,
  photoIds: [],
  doneAt: null,
};

describe("task cards", () => {
  it("say when a task is due in words", () => {
    assert.equal(dueLabel("2026-11-12", "2026-11-12"), "Due today");
    assert.equal(dueLabel("2026-11-13", "2026-11-12"), "Due tomorrow");
    assert.equal(dueLabel("2026-11-16", "2026-11-12"), "Due Mon 16 Nov");
    assert.equal(dueLabel("2026-11-10", "2026-11-12"), "Overdue since Tue 10 Nov");
  });

  it("say who has it and when it was done, and never carry the unit's id", () => {
    const now = new Date("2026-11-12T12:30:00Z");
    const open = taskCardOf(view, "2026-11-12", now, "Africa/Johannesburg");
    assert.equal(open.whoText, "Not given to anyone yet");
    assert.equal(open.whenText, "Due today");
    assert.equal("unitId" in open, false);
    const done = taskCardOf({ ...view, status: "done", assignedTo: "p1", assigneeName: "Lerato", mine: true, doneAt: new Date("2026-11-12T12:05:00Z") }, "2026-11-12", now, "Africa/Johannesburg");
    assert.equal(done.whoText, "With you");
    assert.equal(done.whenText, "Done today at 14:05");
    assert.equal(done.statusName, "Done");
  });
});
