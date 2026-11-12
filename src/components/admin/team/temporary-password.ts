/**
 * Sharing a temporary password (product-spec §9): the owner sees it once
 * and sends it privately, usually on WhatsApp. The person signs in with it
 * and must choose their own straight away.
 */

/** The message that goes with a temporary password: where to sign in, and that it's only for now. */
export function temporaryPasswordMessage({ name, password, signInUrl }: { name: string; password: string; signInUrl: string }): string {
  const firstName = name.trim().split(/\s+/)[0] || "there";
  return `Hi ${firstName}, you can sign in to the Romaic Guesthouse dashboard at ${signInUrl} with your email address and this temporary password: ${password}\n\nYou'll choose your own password as soon as you sign in.`;
}

/** A WhatsApp link that opens a new message with `text`, for the sender to choose who it goes to. */
export function whatsappShareLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
