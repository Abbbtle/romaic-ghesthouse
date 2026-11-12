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
