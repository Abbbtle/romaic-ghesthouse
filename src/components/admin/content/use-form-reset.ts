import { useEffect, useEffectEvent, type RefObject } from "react";

/**
 * Calls `onReset` when the form around `element` is reset (Discard). The
 * browser puts its fields back by itself; this is for what a field keeps in
 * React state instead, such as a list's rows or which kind of link a button
 * has, so it can go back to what was last saved too. It runs before the
 * browser restores the fields, and React renders after, so rows that come
 * back are drawn with their saved values.
 */
export function useFormReset(element: RefObject<HTMLElement | null>, onReset: () => void): void {
  const reset = useEffectEvent(onReset);
  useEffect(() => {
    const form = element.current?.closest("form");
    if (!form) return;
    const listener = () => reset();
    form.addEventListener("reset", listener);
    return () => form.removeEventListener("reset", listener);
  }, [element]);
}
