import { csvDocument, type CsvValue } from "@/lib/format/csv";
import { zonedToday, type IsoDate } from "@/lib/format/zoned-time";
import { bookingStatusNames, type Booking, type Guest } from "@/lib/reservations/reservations";

/**
 * What the business holds about one guest, as a spreadsheet file: their
 * guest record, then each of their bookings, one fact per row (Section,
 * Field, Value), so it reads plainly whatever program opens it. For
 * answering an access request; the owner checks it before sending it on.
 * Text a spreadsheet would run as a formula is made inert by csvDocument.
 */

export type GuestExportInput = {
  guest: Guest;
  anonymisedAt: Date | null;
  bookings: readonly Booking[];
  /** Apartment names by slug and unit names by id, as the site calls them. */
  apartmentNames: Readonly<Record<string, string>>;
  unitNames: Readonly<Record<string, string>>;
  exportedOn: IsoDate;
  timeZone: string;
};

const rands = (cents: number) => (cents / 100).toFixed(2);

export function guestExport({ guest, anonymisedAt, bookings, apartmentNames, unitNames, exportedOn, timeZone }: GuestExportInput): { fileName: string; csv: string } {
  const day = (instant: Date | null) => (instant ? zonedToday(instant, timeZone) : null);
  const rows: CsvValue[][] = [
    ["Section", "Field", "Value"],
    ["Export", "Exported on", exportedOn],
    ["Guest record", "Name", guest.name],
    ["Guest record", "Phone", guest.phone],
    ["Guest record", "Email", guest.email],
    ["Guest record", "Notes", guest.notes],
    ["Guest record", "Added on", day(guest.createdAt)],
    ["Guest record", "Last changed on", day(guest.updatedAt)],
    ["Guest record", "Anonymised on", day(anonymisedAt)],
  ];
  for (const booking of bookings) {
    const section = `Booking ${booking.ref}`;
    rows.push(
      [section, "Status", bookingStatusNames[booking.status]],
      [section, "Room", apartmentNames[booking.apartment] ?? booking.apartment],
      [section, "Unit", unitNames[booking.unitId] ?? null],
      [section, "Arrive", booking.stay.arrive],
      [section, "Leave", booking.stay.leave],
      [section, "Adults", booking.adults],
      [section, "Children", booking.children],
      [section, "Total (rand)", rands(booking.totalCents)],
      [section, "Deposit due (rand)", rands(booking.depositDueCents)],
      [section, "Booked through", booking.channel],
      [section, "Channel's booking number", booking.externalRef],
      [section, "Notes for staff", booking.serviceNotes],
      [section, "Notes", booking.notes],
      [section, "Booked on", day(booking.createdAt)],
      [section, "Checked in on", day(booking.checkedInAt)],
      [section, "Checked out on", day(booking.checkedOutAt)],
      [section, "Cancelled on", day(booking.cancelledAt)],
      [section, "Reason for cancelling", booking.cancelReason],
    );
  }
  return { fileName: `guest-record-${guest.id.slice(0, 8)}-${exportedOn}.csv`, csv: csvDocument(rows) };
}
