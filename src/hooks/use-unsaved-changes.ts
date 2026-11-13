import { useEffect, useEffectEvent } from "react";

/**
 * Guards unsaved changes while `active` (design-spec §11.2): the browser asks
 * before the tab closes or reloads, and a click on a link to another page of
 * this site is held back and handed to `onLeaveAttempt` with its address, so
 * the page can ask in its own dialog and then navigate.
 *
 * Links that open a new tab, downloads, in-page anchors and modified clicks
 * (opening in a new tab) pass straight through; links to other sites are
 * covered by the browser's own prompt.
 */
export function useUnsavedChangesGuard(active: boolean, onLeaveAttempt: (href: string) => void) {
  const leaveAttempted = useEffectEvent(onLeaveAttempt);

  useEffect(() => {
    if (!active) return;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();

    // Capture phase, so this runs before Next.js handles the link.
    const holdLinkClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      const samePage = destination.pathname === window.location.pathname && destination.search === window.location.search;
      if (samePage && destination.hash) return;
      event.preventDefault();
      event.stopPropagation();
      leaveAttempted(`${destination.pathname}${destination.search}${destination.hash}`);
    };

    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("click", holdLinkClick, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("click", holdLinkClick, true);
    };
  }, [active]);
}
