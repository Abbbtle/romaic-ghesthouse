import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

export type DockAction = { label: string; href: string; icon?: ReactNode; external?: boolean };

/**
 * The phone booking dock: two equal actions pinned to the bottom edge, so a
 * guest is always one tap from booking (the craft bar set by the
 * references; see docs/planning/design-references.md). Navy, like the
 * contact bar it sits above, and hidden from large screens, where the header
 * carries the action. Pages that show it pad their foot by --dock-height so
 * it never covers the last content. `inline` renders it in place, for /kit.
 */
export function BookingDock({
  primary,
  secondary,
  inline = false,
  hidden = false,
}: {
  primary: DockAction;
  secondary: DockAction;
  inline?: boolean;
  /** Below the bottom edge, inert and out of the accessibility tree (see DockReveal). */
  hidden?: boolean;
}) {
  return (
    <nav
      aria-label="Book your stay"
      aria-hidden={hidden || undefined}
      inert={hidden}
      className={cx(
        "on-dark z-40 grid grid-cols-2 gap-2 border-t-2 border-romaic-gold bg-midnight-navy px-[max(0.75rem,env(safe-area-inset-left))] pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-sheet",
        inline ? "relative" : "fixed inset-x-0 bottom-0 transition-[translate,visibility] duration-200 ease-out motion-reduce:transition-none lg:hidden",
        hidden && "invisible translate-y-full",
      )}
    >
      {[secondary, primary].map((action, index) => (
        <a
          key={action.label}
          href={action.href}
          {...(action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className={cx(
            "inline-flex min-h-12 items-center justify-center gap-2 rounded-sm px-3 text-sm font-bold tracking-wide",
            index === 1
              ? "bg-cream text-midnight-navy hover:bg-white"
              : "border-[1.5px] border-cream/70 text-white hover:bg-white/10",
          )}
        >
          {action.icon}
          {action.label}
        </a>
      ))}
    </nav>
  );
}
