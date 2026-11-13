import type { Metadata } from "next";
import { AmenityGroups } from "@/components/site/amenity-groups";
import { PageBand, PageHeading } from "@/components/site/page-heading";
import { getSiteContent } from "@/server/site-content";
import { pageMetadata } from "../page-metadata";

/** Read per request with the content as it is now, like every public page (see ../layout.tsx), so it may wait for it. */
export const instant = false;

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata("facilities");
}

/** What the guesthouse offers, in groups, each item with its gold line icon; anything the owner hasn't confirmed is marked. */
export default async function FacilitiesPage() {
  const { facilities } = await getSiteContent();
  return (
    <main id="main" className="flex-1">
      <PageBand spacing="head">
        <PageHeading title={facilities.heading} intro={facilities.intro} />
      </PageBand>
      <PageBand>
        <AmenityGroups groups={facilities.groups} headingLevel={2} />
      </PageBand>
    </main>
  );
}
