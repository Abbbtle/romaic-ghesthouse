import "server-only";
import { createPostgresReportStore } from "@/adapters/postgres/report-store";
import { assertCan, can } from "@/lib/accounts/access";
import { businessTimeZone } from "@/lib/format/zoned-time";
import { createReportService, type ReportService } from "@/lib/reports/report-service";
import { contentService } from "./content";
import { clock, database } from "./infrastructure";

/**
 * The reports as the dashboard uses them: read from Postgres, apartment
 * types named from the site's content, days in the business's time zone,
 * permissions from the accounts core (operations for the owner and sales,
 * revenue for the owner; admin and staff get neither).
 */

let service: ReportService | null = null;

export function reportService(): ReportService {
  service ??= createReportService({
    store: createPostgresReportStore(database()),
    apartmentNames: async () => Object.fromEntries((await contentService().getAll()).apartments.items.map((item) => [item.slug, item.name])),
    clock,
    timeZone: businessTimeZone,
    access: { can, assertCan },
  });
  return service;
}
