import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { env } from "@/server/env";
import { DashboardKit } from "./dashboard-kit";
import { PublicKit } from "./public-kit";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

/**
 * The Romaic design system on one page, for checking it by eye while
 * building: /kit for the public site, /kit?view=admin for the dashboard.
 * Development only: production builds answer 404, unless the build is a
 * client design preview (DESIGN_PREVIEW=1).
 */
export default function KitPage({ searchParams }: PageProps<"/kit">) {
  if (env.isProduction() && !env.isDesignPreview()) notFound();
  return (
    <Suspense>
      <KitView searchParams={searchParams} />
    </Suspense>
  );
}

async function KitView({ searchParams }: Pick<PageProps<"/kit">, "searchParams">) {
  const { view } = await searchParams;
  return view === "admin" ? <DashboardKit /> : <PublicKit />;
}
