"use client";

import { useState } from "react";
import { DatesSearch } from "@/components/site/dates-search";
import { Notice } from "@/components/ui/notice";

/** The dates-and-guests search with sample dates. Searching explains that live availability comes with the booking page (Phase 2). */
export function SearchDemo() {
  const [searched, setSearched] = useState<string | null>(null);
  return (
    <div className="grid gap-3">
      <DatesSearch
        initialArrive="2026-12-11"
        initialLeave="2026-12-14"
        initialGuests={2}
        onSearch={({ arrive, leave, guests }) => setSearched(`${arrive} to ${leave}, ${guests} ${guests === 1 ? "guest" : "guests"}`)}
      />
      {searched && (
        <Notice tone="info" live="polite" title="Search received">
          {searched}. Live availability arrives with the booking page in Phase 2.
        </Notice>
      )}
    </div>
  );
}
