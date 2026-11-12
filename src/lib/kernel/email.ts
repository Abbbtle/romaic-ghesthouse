/**
 * Sending email is a port: the cores compose messages, adapters deliver them
 * (Resend in production, the terminal in development). A core that needs
 * email takes an `EmailSender | null` — null means delivery isn't configured,
 * and the core must still work (the dashboard shows what was missed).
 */

export type EmailMessage = {
  to: string;
  subject: string;
  /** Plain-text body; always provided. */
  text: string;
  /** Optional HTML body. Escape anything that came from a visitor. */
  html?: string;
  /** Where replies go, if not the sender. */
  replyTo?: string;
};

export type EmailDelivery = { ok: true } | { ok: false; reason: string };

export interface EmailSender {
  send(message: EmailMessage): Promise<EmailDelivery>;
}
