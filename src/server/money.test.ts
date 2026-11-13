import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WebhookResult } from "@/lib/money/money-service";
import { gatewaySettingFrom, readBodyWithin, webhookBodyLimit, webhookResponse } from "./money";

const secret = "s".repeat(32);

describe("choosing the payment gateway", () => {
  it("is off in production unless the test gateway is asked for with a long enough secret", () => {
    assert.deepEqual(gatewaySettingFrom({}, true), { kind: "none" });
    assert.deepEqual(gatewaySettingFrom({ TEST_GATEWAY_SECRET: secret }, true), { kind: "none" });
    assert.deepEqual(gatewaySettingFrom({ PAYMENT_GATEWAY: "test" }, true), { kind: "none" });
    assert.deepEqual(gatewaySettingFrom({ PAYMENT_GATEWAY: "test", TEST_GATEWAY_SECRET: "short" }, true), { kind: "none" });
    assert.deepEqual(gatewaySettingFrom({ PAYMENT_GATEWAY: "payfast", TEST_GATEWAY_SECRET: secret }, true), { kind: "none" });
    assert.deepEqual(gatewaySettingFrom({ PAYMENT_GATEWAY: " Test ", TEST_GATEWAY_SECRET: secret }, true), { kind: "test", secret });
  });

  it("is the test gateway in development, with a per-process secret when none is set, unless turned off", () => {
    assert.deepEqual(gatewaySettingFrom({}, false), { kind: "test", secret: null });
    assert.deepEqual(gatewaySettingFrom({ TEST_GATEWAY_SECRET: "short" }, false), { kind: "test", secret: null });
    assert.deepEqual(gatewaySettingFrom({ TEST_GATEWAY_SECRET: secret }, false), { kind: "test", secret });
    assert.deepEqual(gatewaySettingFrom({ PAYMENT_GATEWAY: "none", TEST_GATEWAY_SECRET: secret }, false), { kind: "none" });
  });
});

const post = (body: BodyInit, headers: Record<string, string> = {}) => new Request("https://example.com/api/payments/webhook", { method: "POST", body, headers });

describe("the webhook route's answer", () => {
  it("hands over the raw body exactly and answers with a bare status", async () => {
    const answers: [WebhookResult, number][] = [
      [{ status: "settled" }, 200],
      [{ status: "duplicate" }, 200],
      [{ status: "failed" }, 200],
      [{ status: "ignored" }, 200],
      [{ status: "rejected" }, 400],
      [{ status: "no-gateway" }, 404],
    ];
    for (const [result, code] of answers) {
      let seen = "";
      const response = await webhookResponse(post('{"id":"evt_1", "x": "é"}'), async (rawBody) => {
        seen = rawBody;
        return result;
      });
      assert.equal(response.status, code, result.status);
      assert.equal(seen, '{"id":"evt_1", "x": "é"}');
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.match(await response.text(), /^(OK|Bad request|Not found)$/);
    }
  });

  it("refuses a body over the limit without handing it on", async () => {
    let called = false;
    const response = await webhookResponse(post("x".repeat(webhookBodyLimit + 1)), async () => {
      called = true;
      return { status: "settled" };
    });
    assert.equal(response.status, 413);
    assert.equal(called, false);
  });

  it("stops reading a streamed body once it passes the limit, whatever its length header says", async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(16 * 1024));
        if (pulled > 100) controller.close();
      },
    });
    const request = new Request("https://example.com/", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    assert.equal(await readBodyWithin(request, webhookBodyLimit), null);
    assert.ok(pulled < 10, `read ${pulled} chunks`);
  });
});
