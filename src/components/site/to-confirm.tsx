import { cx } from "@/components/ui/cx";

/**
 * Marks a fact the owner hasn't confirmed yet (it came from the Booking.com
 * listing, mostly): a small, quiet "To confirm" in gold Josefin Sans with a
 * dashed underline, the way a proof is annotated, so it reads as a note on
 * the fact rather than part of it. Gold Text on light grounds and Romaic
 * Gold on navy (fg-brand). Marked data-placeholder so a check can list
 * every one before launch. The owner removes it by ticking "Confirmed" in
 * the dashboard.
 */
export function ToConfirm({ className, label = "To confirm" }: { className?: string; label?: string }) {
  return (
    <span
      data-placeholder="unconfirmed"
      className={cx(
        "inline-flex shrink-0 items-center align-baseline font-display text-[0.75rem] leading-tight font-normal tracking-[0.04em] whitespace-nowrap text-fg-brand underline decoration-current decoration-dashed decoration-1 underline-offset-[3px]",
        className,
      )}
    >
      {label}
    </span>
  );
}

/** A value nobody has given yet, shown as a marked gap rather than a guess: "Still to be confirmed by the owner." */
export function NotYetKnown({ children = "Still to be confirmed by the owner.", className }: { children?: string; className?: string }) {
  return (
    <p data-placeholder="unknown" className={cx("text-base text-fg-3 italic", className)}>
      {children}
    </p>
  );
}
