/**
 * Phone numbers are stored in E.164 ("+27821234567") and shown the way South
 * Africans write them ("+27 82 123 4567"). Input without a country code is
 * assumed to be South African: "082 123 4567", "0821234567", "27821234567"
 * and "+27 (0)82 123 4567" all mean the same number. Other countries need
 * their code: "+44 20 7946 0958" or "0044 20 7946 0958".
 */

export type PhoneParse = { ok: true; e164: string } | { ok: false; reason: "empty" | "invalid" };

const southAfricaCode = "27";

const invalid: PhoneParse = { ok: false, reason: "invalid" };

export function parsePhoneNumber(input: string): PhoneParse {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  // Digits, spaces and the usual separators only; a "+" may only lead.
  if (!/^\+?[\d\s().\-/]+$/.test(trimmed)) return invalid;

  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return international(digits);
  if (digits.startsWith("00")) return international(digits.slice(2));
  if (digits.startsWith("0") && digits.length === 10) return southAfrican(digits.slice(1));
  if (digits.startsWith(southAfricaCode) && digits.length === 11) return southAfrican(digits.slice(2));
  return invalid;
}

function international(digits: string): PhoneParse {
  if (digits.startsWith(southAfricaCode)) {
    const national = digits.slice(2);
    // "+27 (0)67 …": some people keep the trunk 0 after the country code.
    return southAfrican(national.length === 10 && national.startsWith("0") ? national.slice(1) : national);
  }
  // E.164: a country code never starts with 0, and the whole number is at most 15 digits.
  return /^[1-9]\d{7,14}$/.test(digits) ? { ok: true, e164: `+${digits}` } : invalid;
}

function southAfrican(national: string): PhoneParse {
  return /^[1-9]\d{8}$/.test(national) ? { ok: true, e164: `+${southAfricaCode}${national}` } : invalid;
}

/** "+27821234567" → "+27 82 123 4567". Other countries are shown as stored. */
export function formatPhoneNumber(e164: string): string {
  const match = /^\+27(\d{2})(\d{3})(\d{4})$/.exec(e164);
  return match ? `+27 ${match[1]} ${match[2]} ${match[3]}` : e164;
}

/** A tel: link for a stored number. */
export function telHref(e164: string): string {
  return `tel:${e164}`;
}

/**
 * A WhatsApp chat link (https://wa.me/27821234567), optionally with a
 * prefilled message. wa.me wants the number without "+", spaces or the trunk 0.
 */
export function whatsappLink(e164: string, text?: string): string {
  const base = `https://wa.me/${e164.replace(/^\+/, "")}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
