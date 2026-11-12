/** Class names joined with spaces, skipping the empty and the switched-off ones. */
export function cx(...classes: ReadonlyArray<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
