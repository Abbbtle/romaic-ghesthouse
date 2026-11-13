import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EmailMessage } from "@/lib/kernel/email";
import { createConsoleSender } from "./console-sender";
import { createResendSender } from "./resend-sender";

const message: EmailMessage = {
  to: "owner@example.com",
  subject: "New booking request: Tue 20 Oct, 06:00",
  text: "Thandi would like Tue 20 Oct at 06:00.",
  replyTo: "kenneth@example.com",
};

describe("createResendSender", () => {
  it("posts the email to Resend's API with the key, and reports it sent", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const sender = createResendSender({
      apiKey: "re_test",
      from: "Romaic Guesthouse <bookings@example.com>",
      fetch: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return Response.json({ id: "email_1" });
      },
    });
    assert.deepEqual(await sender.send(message), { ok: true });
    assert.equal(calls[0]?.url, "https://api.resend.com/emails");
    assert.equal(new Headers(calls[0]?.init.headers).get("authorization"), "Bearer re_test");
    assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), {
      from: "Romaic Guesthouse <bookings@example.com>",
      to: ["owner@example.com"],
      subject: message.subject,
      text: message.text,
      reply_to: "kenneth@example.com",
    });
    assert.ok(calls[0]?.init.signal, "it gives up rather than waiting forever");
  });

  it("reports a refusal without repeating the message or Resend's error text", async () => {
    const sender = createResendSender({
      apiKey: "re_test",
      from: "bookings@example.com",
      fetch: async () => Response.json({ name: "validation_error", message: "Invalid `to` field: owner@example.com" }, { status: 422 }),
    });
    const delivery = await sender.send(message);
    assert.deepEqual(delivery, { ok: false, reason: "Resend refused the email: HTTP 422 (validation_error)." });
  });

  it("reports a network failure or timeout instead of throwing", async () => {
    const sender = createResendSender({
      apiKey: "re_test",
      from: "bookings@example.com",
      fetch: async () => {
        throw new DOMException("The operation timed out.", "TimeoutError");
      },
    });
    assert.deepEqual(await sender.send(message), { ok: false, reason: "Couldn't reach Resend (TimeoutError)." });
  });
});

describe("createConsoleSender", () => {
  it("prints the email instead of sending it", async () => {
    const printed: string[] = [];
    const sender = createConsoleSender((text) => printed.push(text));
    assert.deepEqual(await sender.send(message), { ok: true });
    assert.match(printed[0] ?? "", /Not sent[\s\S]*To: owner@example\.com[\s\S]*Subject: New booking request[\s\S]*Thandi would like/);
  });
});
