import "server-only";
import type { EmailDelivery, EmailMessage, EmailSender } from "@/lib/kernel/email";

export type ResendSenderConfig = {
  apiKey: string;
  /** A sender on a domain verified in Resend, such as "Romaic Guesthouse <bookings@example.co.za>". */
  from: string;
  /** For tests. */
  fetch?: typeof fetch;
  /** How long to wait for Resend before giving up. */
  timeoutMs?: number;
};

/**
 * Sends email through Resend's REST API with plain fetch (no SDK). It never
 * throws: a failure comes back as a reason the caller can log, which never
 * includes the message or Resend's error text, as both can hold addresses.
 */
export function createResendSender({ apiKey, from, fetch: send = fetch, timeoutMs = 10_000 }: ResendSenderConfig): EmailSender {
  return {
    async send(message: EmailMessage): Promise<EmailDelivery> {
      let response: Response;
      try {
        response = await send("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            ...(message.html ? { html: message.html } : {}),
            ...(message.replyTo ? { reply_to: message.replyTo } : {}),
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const kind = error instanceof Error ? error.name : "unknown error";
        return { ok: false, reason: `Couldn't reach Resend (${kind}).` };
      }
      if (response.ok) return { ok: true };
      return { ok: false, reason: `Resend refused the email: HTTP ${response.status}${await errorName(response)}.` };
    },
  };
}

/** Resend's error name, such as "validation_error", which says what went wrong without repeating the message. */
async function errorName(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null && "name" in body && typeof body.name === "string" ? ` (${body.name})` : "";
  } catch {
    return "";
  }
}
