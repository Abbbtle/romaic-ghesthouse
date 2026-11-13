import "server-only";
import { createPostgresContentStore } from "@/adapters/postgres/content-store";
import type { Database } from "@/adapters/postgres/database";
import { contentDefaults } from "@/content/defaults";
import { assertCan, can } from "@/lib/accounts/access";
import { createContentService, type ContentService, type InvalidStoredSection } from "@/lib/content/service";
import type { AuditRecorder } from "@/lib/kernel/audit";
import { auditRecorder } from "./audit";
import { clock, database, reportError } from "./infrastructure";

/**
 * The content service as the site uses it: Romaic's content in Postgres,
 * seeded from src/content the first time the service is used (each section
 * is stored once, however many servers start at the same moment), dated in
 * the business's time zone, with every save and restore in the audit log.
 * Public pages read it through getSiteContent() (./site-content.ts); the
 * dashboard's editors save through it.
 */

/** The business's time zone: Welkom, South Africa (SAST, UTC+2, no daylight saving). */
export { businessTimeZone } from "@/lib/format/zoned-time";
import { businessTimeZone } from "@/lib/format/zoned-time";

/**
 * Logs a stored section that no longer validates (the site shows its
 * default until someone saves it again). Field paths only: the messages can
 * quote what was typed.
 */
export function reportInvalidSection({ key, revision, errors }: InvalidStoredSection): void {
  reportError(
    `The stored "${key}" content (revision ${revision}) no longer validates, so the site shows its default`,
    new Error(`Fields that need fixing: ${Object.keys(errors).join(", ")}`),
  );
}

export type SiteContentServiceOptions = {
  /** Told about stored sections that no longer validate; logs them by default. */
  onInvalidSection?: (problem: InvalidStoredSection) => void;
  /** Where saves and restores are recorded; the app's audit log by default. */
  audit?: AuditRecorder;
};

/** The content service over `db`. */
export function createSiteContentService(db: Database, options: SiteContentServiceOptions = {}): ContentService {
  return createContentService({
    store: createPostgresContentStore(db),
    defaults: contentDefaults,
    clock,
    timeZone: businessTimeZone,
    audit: options.audit ?? auditRecorder(),
    access: { can, assertCan },
    onInvalidSection: options.onInvalidSection ?? reportInvalidSection,
  });
}

let service: ContentService | null = null;

/**
 * The content service over the app's database, made on first use. It keeps
 * nothing of its own but a note that the defaults are stored, so it's kept
 * per module, like the account and media services: a development reload
 * rebuilds it with the edited code (and checks the seed again, harmlessly).
 */
export function contentService(): ContentService {
  service ??= createSiteContentService(database());
  return service;
}
