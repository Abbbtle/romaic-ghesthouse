import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runMaintenanceTasks } from "./daily-maintenance";

describe("runMaintenanceTasks", () => {
  it("runs each task in turn and reports what each did", async () => {
    const ran: string[] = [];
    const task = (name: string, result: unknown) => async () => {
      ran.push(name);
      return result;
    };
    const summary = await runMaintenanceTasks({ first: task("first", { added: 2 }), second: task("second", 5) }, () => assert.fail("nothing failed"));
    assert.deepEqual(ran, ["first", "second"]);
    assert.deepEqual(summary, { ok: true, tasks: { first: { status: "done", result: { added: 2 } }, second: { status: "done", result: 5 } } });
  });

  it("carries on after a task fails, reporting it for the logs and only marking it failed in the summary", async () => {
    const reported: { description: string; error: unknown }[] = [];
    const failure = new Error("connection lost (with a client's name in it)");
    const summary = await runMaintenanceTasks(
      {
        first: async () => {
          throw failure;
        },
        second: async () => 0,
      },
      (description, error) => reported.push({ description, error }),
    );
    assert.deepEqual(summary, { ok: false, tasks: { first: { status: "failed" }, second: { status: "done", result: 0 } } });
    assert.deepEqual(reported, [{ description: 'The daily task "first" failed', error: failure }]);
    assert.ok(!JSON.stringify(summary).includes("client"), "the summary never repeats an error");
  });
});
