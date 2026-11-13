import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { temporaryPasswordMessage, whatsappShareLink } from "./temporary-password";

describe("sharing a temporary password", () => {
  it("greets the person by first name and says where to sign in", () => {
    const message = temporaryPasswordMessage({ name: "Lerato Mokoena", password: "kd7m-3xqp-v9tr-2hwz", signInUrl: "https://romaicguesthouse.co.za/admin/sign-in" });
    assert.match(message, /^Hi Lerato, /);
    assert.match(message, /https:\/\/romaicguesthouse\.co\.za\/admin\/sign-in/);
    assert.match(message, /kd7m-3xqp-v9tr-2hwz/);
    assert.match(message, /choose your own password/);
  });

  it("opens a new WhatsApp message with the text, for the sender to choose who to send it to", () => {
    assert.equal(whatsappShareLink("Hi Sam & co, 100%?"), "https://wa.me/?text=Hi%20Sam%20%26%20co%2C%20100%25%3F");
  });
});
