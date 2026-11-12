import { Search } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/admin/empty-state";
import { List, ListRow } from "@/components/admin/list";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { privacyGuestPath, privacyPaths } from "@/components/admin/privacy/privacy-paths";
import { PrivacyTabs } from "@/components/admin/privacy/privacy-tabs";
import { inputClasses } from "@/components/ui/form-controls";
import { formatPhoneNumber } from "@/lib/format/phone";
import { requireDashboardActor } from "@/server/admin-session";
import { privacyService } from "@/server/privacy";

export const metadata: Metadata = { title: "Find a guest" };

/**
 * Finding the guest a privacy request is about (Pattern: list): a search by
 * name, phone or email through the reservations core's guest search, with no
 * list of everyone (decision 15). Each result opens what's held about them.
 * Owner only (privacy:requests).
 */
export default async function PrivacyGuestsPage({ searchParams }: PageProps<"/admin/privacy/guests">) {
  const actor = await requireDashboardActor({ permission: "privacy:requests" });
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const guests = query ? await privacyService().searchGuests(actor, query) : [];

  return (
    <>
      <PageHeader title="Find a guest" description="See everything held about a guest, download it for them, or anonymise their record when they ask." />
      <PrivacyTabs current="guests" />
      <div className="grid max-w-admin gap-5">
        <form role="search" action={privacyPaths.guests} className="flex gap-2">
          <label htmlFor="privacy-guests-search" className="sr-only">
            Search guests
          </label>
          <input id="privacy-guests-search" name="q" type="search" defaultValue={query} minLength={2} placeholder="Name, phone or email" className={inputClasses("compact", "min-w-0 flex-1")} />
          <button type="submit" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-sm border-[1.5px] border-ink bg-white px-4 text-sm font-bold text-ink hover:bg-chalk">
            <Search aria-hidden="true" strokeWidth={2} className="size-4" />
            Search
          </button>
        </form>
        {!query ? (
          <EmptyState title="Search for the guest">Use part of their name, their phone number or their email. To answer a request, open it from Information requests and find the guest there, so the two are linked.</EmptyState>
        ) : guests.length > 0 ? (
          <Panel title={`Guests matching "${query}"`} flush>
            <List>
              {guests.map((guest) => (
                <ListRow key={guest.id} href={privacyGuestPath(guest.id)}>
                  <span className="grid gap-0.5">
                    <span className="font-bold break-words text-ink">{guest.name}</span>
                    <span className="text-sm break-all text-fg-2">{[guest.phone && formatPhoneNumber(guest.phone), guest.email].filter(Boolean).join(" · ")}</span>
                  </span>
                </ListRow>
              ))}
            </List>
          </Panel>
        ) : (
          <EmptyState title="No guests match">
            {query.length < 2 ? "Type at least two letters or numbers." : "Try part of the name, the last digits of the phone number, or the email address."}
          </EmptyState>
        )}
      </div>
    </>
  );
}
