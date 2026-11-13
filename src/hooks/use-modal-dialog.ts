import { useEffect, useEffectEvent, useRef, type MouseEvent, type PointerEvent, type RefObject } from "react";

type ModalDialog = {
  ref: RefObject<HTMLDialogElement | null>;
  /** Spread on the <dialog>: a click on the backdrop closes it. */
  backdropProps: {
    onPointerDown: (event: PointerEvent<HTMLDialogElement>) => void;
    onClick: (event: MouseEvent<HTMLDialogElement>) => void;
  };
};

export type ModalDialogFocus = {
  /**
   * What takes the focus when it opens, such as a confirm dialog's Cancel button. Without one, a control
   * inside marked data-autofocus does, else the browser focuses the first control.
   */
  initialFocus?: RefObject<HTMLElement | null>;
  /**
   * What gets the focus back when it closes: the control that opened it.
   * Browsers return focus to whatever had it before opening, which isn't the
   * button that was tapped in Safari (it doesn't focus buttons on a tap).
   */
  returnFocus?: RefObject<HTMLElement | null>;
};

/**
 * Puts the focus on the page's heading, for when the control that had it is
 * gone (a request card after Accept or Spam, a deleted entry's row): left on
 * nothing, keyboard and screen-reader users lose their place. The page
 * doesn't scroll.
 */
export function focusPageHeading(): void {
  const heading = [...document.querySelectorAll<HTMLElement>("main h1, h1")].find((element) => element.offsetParent !== null);
  if (!heading) return;
  if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: true });
}

/**
 * For after an action that removes the row holding the focus (Spam on a
 * request card, deleting an entry): the row goes when the page's refresh
 * lands, and the focus with it, silently (browsers fire no event). This
 * watches the page for a few seconds and puts the focus on the heading once
 * it's been lost.
 */
export function keepFocusOnPage(): void {
  const lost = () => document.activeElement === null || document.activeElement === document.body;
  const watcher = new MutationObserver(() => {
    if (!lost()) return;
    focusPageHeading();
    stop();
  });
  const timer = window.setTimeout(() => stop(), 10_000);
  const stop = () => {
    watcher.disconnect();
    window.clearTimeout(timer);
  };
  watcher.observe(document.body, { childList: true, subtree: true });
}

/**
 * Drives a native <dialog> as a modal from an `open` prop. showModal() gives
 * focus trapping, Escape and an inert page for free. `onClose` runs when the
 * person closes it (Escape, the backdrop, or anything calling
 * dialog.close()), so the owner can update its state; closing it by setting
 * `open` to false doesn't call it.
 */
export function useModalDialog(open: boolean, onClose: () => void, { initialFocus, returnFocus }: ModalDialogFocus = {}): ModalDialog {
  const ref = useRef<HTMLDialogElement>(null);
  const pressStartedOnBackdrop = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      (initialFocus?.current ?? dialog.querySelector<HTMLElement>("[data-autofocus]"))?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
    // Navigating away keeps the page alive but hidden, and a modal left open
    // there would make the next page inert. Closing it here leaves the owner's
    // state alone (the close listener is gone before the event fires), so the
    // dialog opens again when the person comes back.
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open, initialFocus]);

  // The close event comes after the fact, so it reads the latest `open`: when
  // the owner already said closed, there's nothing to tell it.
  const closed = useEffectEvent(() => {
    // Opened again before the event arrived (put away and shown again): it's still open.
    if (ref.current?.open) return;
    // The owner hears first, so it can say where focus goes (a dialog opened
    // from a link has no opener until then).
    if (open) onClose();
    // The browser restores focus to whatever had it before opening, if
    // anything did; the control that opened it is the better place, while
    // it's still on the page (a deleted row's button isn't).
    const opener = returnFocus?.current;
    if (opener?.isConnected) opener.focus();
    else if (document.activeElement === null || document.activeElement === document.body) focusPageHeading();
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => closed();
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, []);

  return {
    ref,
    backdropProps: {
      // The backdrop belongs to the dialog element itself; the content fills it,
      // so only presses outside the content land on the dialog. A drag that
      // starts inside (selecting text) and ends outside doesn't close it.
      onPointerDown: (event) => {
        pressStartedOnBackdrop.current = event.target === event.currentTarget;
      },
      onClick: (event) => {
        if (pressStartedOnBackdrop.current && event.target === event.currentTarget) event.currentTarget.close();
        pressStartedOnBackdrop.current = false;
      },
    },
  };
}
