import type { LineStatus } from "@/lib/bookkeeping/bank";
import { formatCents } from "@/lib/format/money";
import type { StatusTone } from "../status-pill";

/** A line's state in words, with a tone that only helps. */
export const lineStatusNames: Record<LineStatus, string> = { unmatched: "Not matched yet", matched: "Matched", reversed: "Journal reversed" };

export const lineStatusTones: Record<LineStatus, StatusTone> = { unmatched: "warning", matched: "success", reversed: "danger" };

/** Which lines an account's page lists, from the address. */
export const lineViews = ["unmatched", "matched", "all"] as const;
export type LineView = (typeof lineViews)[number];

export function lineViewFrom(value: unknown): LineView {
  return (lineViews as readonly unknown[]).includes(value) ? (value as LineView) : "unmatched";
}

/** Money moved by a statement line, with its way in words rather than a minus: "R10,000 in", "R65 out". */
export function moneyInOut(cents: number): string {
  return `${formatCents(Math.abs(cents))} ${cents < 0 ? "out" : "in"}`;
}

/** A balance, with an overdrawn one said in words rather than with a minus: "R1,600", "R500 overdrawn". */
export function balanceWords(cents: number): string {
  return cents < 0 ? `${formatCents(-cents)} overdrawn` : formatCents(cents);
}

/** "1 line", "3 lines". */
export function linesCount(count: number): string {
  return `${count} ${count === 1 ? "line" : "lines"}`;
}
