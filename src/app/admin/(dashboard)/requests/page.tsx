import type { Metadata } from "next";
import { adminRoutes } from "@/components/admin/admin-routes";
import { RequestsScreen, type RequestRow } from "@/components/admin/requests/requests-screen";
import type { StatusTone } from "@/components/admin/status-pill";
import { capitalised, whenLabel } from "@/components/admin/when-label";
import { can } from "@/lib/accounts/access";
import { guestsOf, requestStatusNames, type BookingRequest, type RequestStatus } from "@/lib/booking/requests";
import { formatPhoneNumber, telHref, whatsappLink } from "@/lib/format/phone";
import { businessTimeZone } from "@/lib/format/zoned-time";
import { stayLabel } from "@/lib/inventory/stays";
import type { Unit } from "@/lib/inventory/units";
import type { Actor } from "@/lib/kernel/actor";
import { requireDashboardActor } from "@/server/admin-session";
import { env } from "@/server/env";
import { clock } from "@/server/infrastructure";
import { getSiteContent } from "@/server/site-content";
import { bookingService, inventoryService } from "@/server/stays";
import { acceptRequest, cancelAcceptedRequest, declineRequest } from "./actions";

export const metadata: Metadata = { title: "Booking requests" };

const statusTones: Record<RequestStatus, StatusTone> = { waiting: "warning", accepted: "success", declined: "neutral", expired: "neutral" };

const hrefs = { waiting: adminRoutes.requests, handled: `${adminRoutes.requests}?list=handled` } as const;

/**
 * Booking requests for the owner and sales: guests' contact details, so
 * it's behind bookings:view (never admin or staff). Accepting needs
 * bookings:create and declining bookings:cancel; the buttons show only to
 * those who may use them, and the actions and service check again.
 */
export default async function RequestsPage({ searchParams }: PageProps<"/admin/requests">) {
  const actor = await requireDashboardActor({ permission: "bookings:view" });
  const { list: asked } = await searchParams;
  const list = asked === "handled" ? "handled" : "waiting";
  const booking = bookingService();
  const [requests, waitingCount, { site }] = await Promise.all([
    list === "waiting" ? booking.inbox.waiting(actor) : booking.inbox.handled(actor),
    booking.inbox.waitingCount(actor),
    getSiteContent(),
  ]);
  const units = list === "waiting" && can(actor, "availability:view") ? (await inventoryService().overview(actor)).units : [];
  const rows = await Promise.all(requests.map((request) => rowOf(actor, request, site.businessName, list, units)));
  return (
    <RequestsScreen
      list={list}
      rows={rows}
      waitingCount={waitingCount}
      canAccept={can(actor, "bookings:create")}
      canDecline={can(actor, "bookings:cancel")}
      acceptAction={acceptRequest}
      declineAction={declineRequest}
      cancelAction={cancelAcceptedRequest}
      bookPageHref={`${env.siteUrl()}/book`}
      apartmentsHref={adminRoutes.apartments}
      hrefs={hrefs}
    />
  );
}

async function rowOf(actor: Actor, request: BookingRequest, businessName: string, list: "waiting" | "handled", units: readonly Unit[]): Promise<RequestRow> {
  const now = clock.now();
  const inventory = inventoryService();
  const firstName = request.name.split(" ")[0] ?? request.name;
  const guests = guestsOf(request);
  const freeUnits = list === "waiting" && can(actor, "availability:view") ? await inventory.freeUnits(actor, request.apartment, request.stay) : [];
  const decided = request.decision ? capitalised(whenLabel(request.decision.at, now, businessTimeZone)) : null;
  return {
    id: request.id,
    ref: request.ref,
    apartmentName: request.apartmentName,
    stay: stayLabel(request.stay),
    guests: `${guests} ${guests === 1 ? "guest" : "guests"}${request.children > 0 ? ` (${request.children} ${request.children === 1 ? "child" : "children"})` : ""}`,
    name: request.name,
    phone: { display: formatPhoneNumber(request.phone), tel: telHref(request.phone) },
    whatsapp: whatsappLink(request.phone, `Hi ${firstName}, thank you for your booking request ${request.ref} at ${businessName}.`),
    email: request.email,
    arrivalTime: request.arrivalTime,
    notes: request.notes,
    sent: capitalised(whenLabel(request.createdAt, now, businessTimeZone)),
    status: { label: requestStatusNames[request.status], tone: statusTones[request.status] },
    decision: decided && [decided, request.decision?.note].filter(Boolean).join(" · "),
    freeUnits: freeUnits.map((unit) => ({ id: unit.id, name: unit.name })),
    hasUnits: units.some((unit) => unit.active && unit.apartment === request.apartment),
    cancellable: request.status === "accepted" && request.stay.leave > inventory.today(),
    consent: `The booking form's consent (version ${request.consent.consentVersion}) and the privacy notice (version ${request.consent.noticeVersion})`,
  };
}
