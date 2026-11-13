"use client";

import type { ReactNode } from "react";
import { SheetForm } from "../sheet-form";

/**
 * The expenses filter below 1024 px: one line saying what the list shows
 * ("1–30 Nov 2026 · All suppliers"), with Change opening the filter's form
 * in a sheet, so the list itself fills the first screen. The form is drawn
 * on the server and passed in; submitting it reloads the list.
 */
export function ExpenseFilterSheet({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 lg:hidden">
      <p className="min-w-0 text-sm text-fg-2">{summary}</p>
      <SheetForm trigger="Change" variant="secondary" size="sm" title="Show expenses" description="Choose the dates, one supplier or what they were for.">
        {() => children}
      </SheetForm>
    </div>
  );
}
