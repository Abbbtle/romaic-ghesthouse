"use client";

import { X } from "lucide-react";
import { useId, type ReactNode, type RefObject } from "react";
import { useModalDialog } from "@/hooks/use-modal-dialog";
import { cx } from "./cx";
import { IconButton } from "./icon-button";
import { textStyles } from "./typography";

/**
 * responsive: a bottom sheet on phones and a right drawer from 1024 px (booking
 * requests, admin editors). right: a full-height panel from the right at every
 * size (the site's mobile menu). bottom: a bottom sheet at every size (the
 * admin "More" sheet).
 */
export type SheetPlacement = "responsive" | "right" | "bottom";

/** The drawer's width from 1024 px: md 440 px (booking), lg 480 px (diary editor). */
export type SheetWidth = "md" | "lg";

/**
 * plain: the surface of wherever it opens (white in the admin, chalk on the
 * site). paper: the public site's chalk-paper task surface (the request
 * sheet); outside the site theme it looks the same as plain.
 */
export type SheetLook = "plain" | "paper";

// Shared by every placement: the dialog is the panel itself, so a click that
// lands on the dialog element is a click on its backdrop.
const panel =
  "m-0 max-w-none border-0 bg-raised p-0 text-fg shadow-3 open:flex flex-col transition-[translate,opacity,overlay,display] transition-discrete duration-150 ease-in open:ease-out backdrop:bg-[var(--color-backdrop,rgb(13_15_12/0.55))] backdrop:opacity-0 backdrop:transition-[opacity,overlay,display] backdrop:transition-discrete backdrop:duration-150 open:backdrop:opacity-100 open:backdrop:duration-200 starting:open:backdrop:opacity-0";

// Sheets rise from the bottom (300 ms in, 150 ms out); from 1024 px the
// responsive one becomes a drawer that eases in 24 px from the right (200 ms).
// Under reduced motion they simply appear.
const bottomSheet =
  "inset-x-0 top-auto bottom-0 h-auto max-h-[92svh] w-full rounded-t-lg border-t border-hairline open:duration-300 motion-safe:translate-y-full motion-safe:open:translate-y-0 motion-safe:starting:open:translate-y-full";

const drawerFromLg = (width: SheetWidth) =>
  cx(
    "lg:inset-y-0 lg:right-0 lg:left-auto lg:h-full lg:max-h-none lg:rounded-none lg:border-t-0 lg:border-l lg:open:duration-200",
    width === "md" ? "lg:w-[440px]" : "lg:w-[480px]",
    "lg:motion-safe:translate-x-6 lg:motion-safe:translate-y-0 lg:opacity-0 lg:open:opacity-100 lg:motion-safe:open:translate-x-0 lg:motion-safe:starting:open:translate-x-6 lg:starting:open:opacity-0",
  );

const rightPanel =
  "inset-y-0 right-0 left-auto h-full max-h-none w-[min(100%,24rem)] border-l border-hairline open:duration-300 motion-safe:translate-x-full motion-safe:open:translate-x-0 motion-safe:starting:open:translate-x-full";

function placementClasses(placement: SheetPlacement, width: SheetWidth): string {
  if (placement === "right") return rightPanel;
  if (placement === "bottom") return bottomSheet;
  return cx(bottomSheet, drawerFromLg(width));
}

type SheetProps = {
  /** For the opening button's aria-controls. */
  id?: string;
  open: boolean;
  /** Called when the person closes it: the close button, Escape or the backdrop. */
  onClose: () => void;
  title: ReactNode;
  /** A line under the title, e.g. "60-minute session at The Campus Gym, Bryanston". */
  description?: ReactNode;
  /** Keeps the title for screen readers only, for sheets that are obvious from their content (a menu). */
  hideTitle?: boolean;
  /** Pinned to the bottom: the sheet's actions. */
  footer?: ReactNode;
  placement?: SheetPlacement;
  width?: SheetWidth;
  look?: SheetLook;
  /** The close button's name and tooltip. */
  closeLabel?: string;
  /** The control that opened it, which gets the focus back when it closes. */
  returnFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
};

/**
 * A modal sheet on a native <dialog> (design-spec §8): focus moves in and is
 * trapped, Escape and the backdrop close it, the page behind stops scrolling,
 * and focus returns to the control that opened it. Its content stays mounted
 * while closed, so a half-filled form keeps its values.
 */
export function Sheet({
  id,
  open,
  onClose,
  title,
  description,
  hideTitle = false,
  footer,
  placement = "responsive",
  width = "md",
  look = "plain",
  closeLabel = "Close",
  returnFocus,
  children,
}: SheetProps) {
  const titleId = useId();
  const descriptionId = useId();
  const { ref, backdropProps } = useModalDialog(open, onClose, { returnFocus });
  const grabber = placement !== "right";

  return (
    <dialog
      ref={ref}
      id={id}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={cx(panel, placementClasses(placement, width), look === "paper" && "paper")}
      {...backdropProps}
    >
      {grabber && <div aria-hidden="true" className={cx("mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-grabber", placement === "responsive" && "lg:hidden")} />}
      <div className={cx("flex shrink-0 items-start gap-3 px-4 pt-3 pb-2 lg:px-6", placement !== "bottom" && "lg:pt-5", hideTitle ? "justify-end" : "justify-between")}>
        <div className={cx("min-w-0", hideTitle && "sr-only")}>
          <h2 id={titleId} className={textStyles.h3}>
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="mt-1 text-sm text-fg-3">
              {description}
            </p>
          )}
        </div>
        <IconButton label={closeLabel} icon={<X aria-hidden="true" />} onClick={onClose} align="end" className="-mt-1 -mr-2" />
      </div>
      <div data-lenis-prevent="" className={cx("min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 lg:px-6", footer ? "pb-4" : "pb-[calc(1.5rem+env(safe-area-inset-bottom))]")}>
        {children}
      </div>
      {footer && (
        <div className="shrink-0 border-t border-hairline bg-raised px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:px-6 lg:pb-4">{footer}</div>
      )}
    </dialog>
  );
}
