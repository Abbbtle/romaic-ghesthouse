import type { Metadata } from "next";
import { NotFoundView } from "@/components/site/status-views";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

/** A page the site doesn't have, such as an apartment that's no longer shown, inside the site's own frame. */
export default function SiteNotFound() {
  return (
    <main id="main" className="flex flex-1 items-center">
      <NotFoundView />
    </main>
  );
}
