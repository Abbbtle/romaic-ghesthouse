/**
 * Prices are whole rands, shown the way the site always has: "R4,400"
 * (no space, comma thousands, no cents). Don't use Intl's en-ZA currency
 * format for this: it gives "R 4 400,00".
 */
export function formatRands(amount: number): string {
  if (!Number.isFinite(amount)) throw new RangeError(`Not an amount: ${amount}`);
  const whole = Math.round(amount);
  const digits = Math.abs(whole)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${whole < 0 ? "-" : ""}R${digits}`;
}

/**
 * An amount in cents as the dashboard shows money: "R1,250" when it's whole
 * rands, "R1,250.50" when it isn't. Bookings, payments and invoices keep
 * cents (integers) so sums never drift.
 */
export function formatCents(cents: number): string {
  if (!Number.isInteger(cents)) throw new RangeError(`Not a whole number of cents: ${cents}`);
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  const rands = Math.floor(absolute / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const rest = absolute % 100;
  return `${sign}R${rands}${rest === 0 ? "" : `.${String(rest).padStart(2, "0")}`}`;
}

/** Cents as a form shows them for editing: "1250" or "1250.50". */
export function centsForInput(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}
