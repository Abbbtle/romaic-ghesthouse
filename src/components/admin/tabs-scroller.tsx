"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/ui/cx";

/** How far the fade reaches in from an edge with more tabs beyond it. */
const fade = "2rem";

/** A mask that fades the edges with more beyond them; none when everything fits. */
function maskFor(start: boolean, end: boolean): string | undefined {
  if (!start && !end) return undefined;
  return `linear-gradient(to right, ${start ? "transparent" : "#000"}, #000 ${fade}, #000 calc(100% - ${fade}), ${end ? "transparent" : "#000"})`;
}

/**
 * The frame a bar of tabs scrolls in when it's wider than the screen (seven
 * Books tabs on a 375 px phone). On arrival the current tab is brought to
 * the middle, like scrollIntoView({ block: "nearest", inline: "center" })
 * but moving only this bar, never the page; it jumps there, so there's no
 * motion for reduced-motion settings to stop. An edge with more tabs beyond
 * it fades out, so it's plain there's more to scroll to.
 */
export function TabsScroller({ label, current, className, children }: { label: string; current: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const scroller = ref.current;
    if (!scroller) return;
    const measure = () => {
      const furthest = scroller.scrollWidth - scroller.clientWidth;
      // A pixel's slack: zoomed screens report fractional widths.
      const next = { start: scroller.scrollLeft > 1, end: scroller.scrollLeft < furthest - 1 };
      setEdges((now) => (now.start === next.start && now.end === next.end ? now : next));
    };
    const item = scroller.querySelector<HTMLElement>('[aria-current="page"]');
    if (item && scroller.scrollWidth > scroller.clientWidth) {
      const frame = scroller.getBoundingClientRect();
      const box = item.getBoundingClientRect();
      scroller.scrollTo({ left: scroller.scrollLeft + box.left - frame.left - (frame.width - box.width) / 2, behavior: "instant" });
    }
    scroller.addEventListener("scroll", measure, { passive: true });
    // A ResizeObserver reports once as it starts, so this measures the bar the first time too.
    const resized = new ResizeObserver(measure);
    resized.observe(scroller);
    if (scroller.firstElementChild) resized.observe(scroller.firstElementChild);
    return () => {
      scroller.removeEventListener("scroll", measure);
      resized.disconnect();
    };
  }, [current]);

  const mask = maskFor(edges.start, edges.end);
  return (
    <nav ref={ref} aria-label={label} className={cx("max-w-full overflow-x-auto scroll-px-8", className)} style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}>
      {children}
    </nav>
  );
}
