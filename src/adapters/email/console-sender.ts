import "server-only";
import type { EmailSender } from "@/lib/kernel/email";

/**
 * Development stand-in for Resend: prints each email to the terminal instead
 * of sending it. Never used in production (see emailSender() in
 * src/server/infrastructure.ts), where printing messages would put personal
 * data in the logs.
 */
export function createConsoleSender(print: (text: string) => void = console.info): EmailSender {
  return {
    async send(message) {
      print(
        [
          "[email] Not sent: Resend isn't configured, so here it is instead.",
          `To: ${message.to}`,
          ...(message.replyTo ? [`Reply-To: ${message.replyTo}`] : []),
          `Subject: ${message.subject}`,
          "",
          message.text,
        ].join("\n"),
      );
      return { ok: true };
    },
  };
}
