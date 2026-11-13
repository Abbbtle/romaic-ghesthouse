import { cx } from "@/components/ui/cx";

/**
 * Marks a fact the owner hasn't confirmed yet (it came from the Booking.com
 * listing, mostly): a small dashed-gold tag reading "To confirm", like the
 * logo slot and stand-in photos say what they are. Marked data-placeholder
 * so a check can list every one before launch. The owner removes it by
 * ticking "Confirmed" in the dashboard.
 */
export function ToConfirm({ className, label = "To confirm" }: { className?: string; label?: string }) {
  return (
    <span
      data-placeholder="unconfirmed"
      className={cx(
        "inline-flex shrink-0 items-center rounded-xs border border-dashed border-gold-text px-1.5 py-px align-middle text-xs font-bold whitespace-nowrap text-gold-text",
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
