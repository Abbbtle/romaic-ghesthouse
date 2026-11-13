import { Search } from "lucide-react";
import type { Metadata } from "next";
import { adminRoutes } from "@/components/admin/admin-routes";
import { EmptyState } from "@/components/admin/empty-state";
import { List, ListRow } from "@/components/admin/list";
import { PageHeader } from "@/components/admin/page-header";
import { Panel } from "@/components/admin/panel";
import { inputClasses } from "@/components/ui/form-controls";
import { formatPhoneNumber } from "@/lib/format/phone";
import { requireDashboardActor } from "@/server/admin-session";
import { reservationService } from "@/server/stays";

export const metadata: Metadata = { title: "Guests" };

/**
 * Guests for the owner and sales (Pattern: list): a search by name, phone or
 * email. There's no browse-all list: guests are personal information
 * (POPIA), so the page shows only who you look for.
 */
export default async function GuestsPage({ searchParams }: PageProps<"/admin/guests">) {
  const actor = await requireDashboardActor({ permission: "guests:view" });
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const guests = query ? await reservationService().searchGuests(actor, query) : [];
  return (
    <>
      <PageHeader title="Guests" description="Everyone who has booked, with how to reach them and their stays." />
      <div className="grid max-w-admin gap-5">
        <form role="search" action={adminRoutes.guests} className="flex gap-2">
          <label htmlFor="guest-search" className="sr-only">
            Search guests
          </label>
          <input id="guest-search" name="q" type="search" defaultValue={query} minLength={2} placeholder="Name, phone or email" className={inputClasses("compact", "flex-1")} />
          <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-sm border-[1.5px] border-ink bg-white px-4 text-sm font-bold text-ink hover:bg-chalk">
            <Search aria-hidden="true" strokeWidth={2} className="size-4" />
            Search
          </button>
        </form>
        {!query ? (
          <EmptyState title="Find a guest">Search by part of their name, their phone number or email. Guests are added when you make or accept a booking.</EmptyState>
        ) : guests.length > 0 ? (
          <Panel title={`Guests matching "${query}"`} flush>
            <List>
              {guests.map((guest) => (
                <ListRow key={guest.id} href={`${adminRoutes.guests}/${guest.id}`}>
                  <span className="grid gap-0.5">
                    <span className="font-bold text-ink">{guest.name}</span>
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
