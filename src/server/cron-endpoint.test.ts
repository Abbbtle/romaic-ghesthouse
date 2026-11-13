import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cronResponse } from "./cron-endpoint";
import type { MaintenanceSummary } from "./daily-maintenance";

const secret = "s3cret-for-the-daily-job";

const summary: MaintenanceSummary = { ok: true, tasks: { seriesTopUp: { status: "done", result: { series: 2, added: 4, skipped: 0 } } } };

function call(authorization?: string): Request {
  return new Request("https://www.romaicguesthouse.co.za/api/cron/daily", authorization ? { headers: { Authorization: authorization } } : {});
}

/** A daily job that counts its runs and answers with `result`. */
function job(result: MaintenanceSummary = summary) {
  const runs = { count: 0 };
  return {
    runs,
    run: async () => {
      runs.count += 1;
      return result;
    },
  };
}

describe("GET /api/cron/daily", () => {
  it("runs the daily job for the cron secret and answers with its summary, never cached", async () => {
    const { runs, run } = job();
    const response = await cronResponse(call(`Bearer ${secret}`), { secret, production: true }, run);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), summary);
    assert.equal(runs.count, 1);
  });

  it("refuses a missing or wrong secret with 401, without running anything", async () => {
    const { runs, run } = job();
    for (const authorization of [undefined, `Bearer ${secret}x`, `Bearer ${secret.slice(1)}`, secret, `Basic ${secret}`, "Bearer "]) {
      const response = await cronResponse(call(authorization), { secret, production: true }, run);
      assert.equal(response.status, 401, String(authorization));
      assert.equal(response.headers.get("www-authenticate"), "Bearer");
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    assert.equal(runs.count, 0);
  });

  it("stays off in production until CRON_SECRET is set", async () => {
    const { runs, run } = job();
    const response = await cronResponse(call("Bearer anything"), { secret: null, production: true }, run);
    assert.equal(response.status, 503);
    assert.match(((await response.json()) as { error: string }).error, /CRON_SECRET/);
    assert.equal(runs.count, 0);
  });

  it("runs without a secret in development, where there isn't one", async () => {
    const { runs, run } = job();
    assert.equal((await cronResponse(call(), { secret: null, production: false }, run)).status, 200);
    assert.equal(runs.count, 1);
  });

  it("answers 500 with the summary when a task failed, so the cron's log shows it", async () => {
    const failed: MaintenanceSummary = { ok: false, tasks: { seriesTopUp: { status: "failed" } } };
    const response = await cronResponse(call(`Bearer ${secret}`), { secret, production: true }, job(failed).run);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), failed);
  });
});
