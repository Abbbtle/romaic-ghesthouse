import { LoadingStatus, Skeleton } from "@/components/ui/skeleton";

/*
 * Loading states in the shape of the content pages, for
 * their loading.tsx: they show at once when someone taps through to a page,
 * and after 100 ms, so a quick answer never flashes them.
 */

function HeaderSkeleton() {
  return (
    <div className="mb-6 grid gap-3 lg:mb-8">
      <Skeleton className="h-8 w-40 lg:h-10 lg:w-56" />
      <Skeleton className="h-4 w-full max-w-md" />
    </div>
  );
}

/** The content page: its section cards. */
export function ContentOverviewSkeleton() {
  return (
    <LoadingStatus label="Loading your content…">
      <HeaderSkeleton />
      <div className="grid max-w-admin grid-cols-1 gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, card) => (
          <div key={card} className="grid gap-2.5 rounded-md border border-hairline bg-white p-4 lg:p-5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        ))}
      </div>
    </LoadingStatus>
  );
}

/** A section's editor: the nav beside a form of labelled fields. */
export function SectionEditorSkeleton() {
  return (
    <LoadingStatus label="Loading the editor…">
      <HeaderSkeleton />
      <div className="lg:grid lg:grid-cols-[13.75rem_minmax(0,40rem)] lg:gap-10">
        <div className="hidden gap-2 lg:grid lg:content-start">
          {Array.from({ length: 4 }, (_, item) => (
            <Skeleton key={item} className="h-4 w-36" />
          ))}
        </div>
        <div className="grid gap-6 rounded-md border border-hairline bg-white p-5 lg:p-7">
          <Skeleton className="h-6 w-28" />
          {Array.from({ length: 5 }, (_, field) => (
            <div key={field} className="grid gap-2">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-11 w-full" />
            </div>
          ))}
        </div>
      </div>
    </LoadingStatus>
  );
}
