import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";

/**
 * Loading states in the shape of what's coming (design-spec §11.4), for the
 * dashboard's loading.tsx files. Each says "Loading…" once to screen readers
 * and appears only after 100 ms.
 */

/** A list: a header and five rows. */
export function ListSkeleton({ rows = 5, label }: { rows?: number; label?: string }) {
  return (
    <LoadingStatus label={label}>
      <div className="overflow-hidden rounded-md border border-hairline bg-white">
        <div className="border-b border-hairline px-4 py-3.5">
          <Skeleton className="h-4 w-36" />
        </div>
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex items-center gap-4 border-b border-hairline px-4 py-4 last:border-b-0">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-10" />
          </div>
        ))}
      </div>
    </LoadingStatus>
  );
}

/** The Today page's headline numbers. */
export function KpiSkeleton({ tiles = 3, label }: { tiles?: number; label?: string }) {
  return (
    <LoadingStatus label={label}>
      <div className="grid grid-cols-3 gap-2 lg:gap-4">
        {Array.from({ length: tiles }, (_, tile) => (
          <div key={tile} className="grid min-h-24 content-between gap-3 rounded-md border border-hairline bg-white p-3 lg:p-4">
            <Skeleton className="h-8 w-10" />
            <Skeleton className="h-3.5 w-3/4" />
          </div>
        ))}
      </div>
    </LoadingStatus>
  );
}

/** A dashboard page: its title, then a list. */
export function PageSkeleton({ label = "Loading…" }: { label?: string }) {
  return (
    <LoadingStatus label={label}>
      <div className="mb-6 grid gap-3 lg:mb-8">
        <Skeleton className="h-8 w-40 lg:h-10 lg:w-56" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="overflow-hidden rounded-md border border-hairline bg-white">
        {Array.from({ length: 5 }, (_, row) => (
          <div key={row} className="flex items-center gap-4 border-b border-hairline px-4 py-4 last:border-b-0">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    </LoadingStatus>
  );
}
