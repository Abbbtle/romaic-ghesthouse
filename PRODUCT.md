# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Guests, two groups served equally (confirmed 2026-11-12):**

- **Work travellers:** people in Welkom for business, contract work or government work. They are often booked or paid for by an employer, need a desk, Wi-Fi and an invoice, and arrive late on weekdays.
- **Families and visiting relatives:** they need room for up to five, a kitchenette, child-friendly rules and safe parking.

The host's own listing says guests come "for business, work, family or a short getaway". Most arrive on a phone, comparing against Booking.com. Their questions, in order:

1. Is a room free for my dates?
2. Will it fit us?
3. What does it cost?
4. Is it safe, and will the water and power work?
5. How do I book or reach someone?

**People who run the business from the dashboard** (all non-technical, mostly on phones):

- **Owner:** runs the guesthouse and holds everything, including the books, tax and payroll. The owners' names are not confirmed for publication.
- **Admin (Weberu agency staff):** set up and maintain the site, content, SEO, media and integrations. They have **no access to finance data** of any kind.
- **Sales:** take and manage bookings from every channel, quotes, rates and guest records.
- **Staff:** check guests in and out and do housekeeping and maintenance, from Today and task lists. They see only guest name, room, dates and service notes.

The full permission matrix is in `docs/planning/roles.md` (local, draft for confirmation).

## Product Purpose

Romaic Guesthouse is an owner-run guesthouse at 286 Stateway, Bedelia, Welkom, Free State. The product has two jobs:

1. **Win direct bookings.** A premium public site shows what each room really offers and live availability, and takes a booking request in under a minute, so guests book direct rather than through an online travel agent.
2. **Run the whole business from one place.** The dashboard covers:
   - bookings from every channel, kept in step by iCal;
   - check-in and out, housekeeping and maintenance;
   - rates and guests;
   - all site content;
   - the books (double-entry);
   - preparation of SARS returns for the owner or their accountant to file.

Success means:

- more direct bookings and fewer phone and WhatsApp round trips;
- no double bookings across channels;
- the owner changes rooms, prices, photos and text without paying the agency;
- the owner's accountant gets clean exports instead of a shoebox.

## Positioning

The site leads with all three of these together (confirmed 2026-11-12). They are the host's own words on the Booking.com listing: **"Spacious. Comfortable. Reliable."**

1. **Reliable.** It keeps working when Welkom's services don't. The host lists:
   - backup water from two JoJo tanks;
   - backup gas geysers;
   - solar backup power;
   - electric fencing, CCTV and secure, enclosed parking.

   This is the claim nearby competitors can't copy truthfully. Show the specifics; don't just assert it.
2. **Comfortable and owner-run.** A warm, personal welcome from the people who own it. This needs the client's own words. Booking.com reviews can't be quoted.
3. **Well placed.** In Bedelia, a short walk from Welkom's CBD, shops and restaurants.

All three claims come from the host's listing text and still need the client's confirmation before they appear as fact (see `docs/planning/property-facts.md`).

## Operating Context

- **Channels:** the property sells on Booking.com, which collects payment for its own bookings. The other channels and any channel manager are unknown (open question). Booking.com's connectivity API is only for certified partners, so channel sync is two-way iCal per room. iCal carries blocked dates only, so imported stays arrive as placeholders that sales complete from each channel's extranet.
- **Listing name:** Booking.com already shows "Romaic Guesthouse Welkom", but its URL slug still says "mosaic-guesthouse".
- **Rules from the listing (to confirm for direct bookings):**
  - check-in 15:00–21:00, check-out 05:00–10:00;
  - quiet hours 22:00–07:00;
  - no pets, no smoking, no parties;
  - children of any age are welcome, and from age 9 they are charged as adults;
  - no cots or extra beds.
- **Languages:** Afrikaans and English are spoken. Whether the site is bilingual is an open question.
- **Booking mode** (request then confirm, or instant with a deposit) and the **payment gateway** are open decisions. Booking pages must work with either.
- **Dashboard work happens in short bursts on phones.** Today, bookings and tasks are designed for phones first. Tables and reports must also work on desktop.

## Capabilities and Constraints

- **Public pages (planned):**
  - Home;
  - Rooms: a list, plus one page per room type;
  - Gallery, Facilities, Location and area, Policies;
  - Contact: WhatsApp, phone, email, map;
  - Book, with live availability per room, leading to a booking request;
  - a confirmation page;
  - Privacy (POPIA);
  - 404 and error pages.
- **Rooms:** seven room types on the listing, from a wheelchair-accessible family room to doubles with a bath. The number of units per type, real room sizes and prices are unknown. Never publish the listing's identical "108 ft²" sizes.
- **Everything visible is editable** in the dashboard and goes live without a redeploy: text, images, prices, rooms and policies. Layouts must survive longer names, more or fewer rooms and swapped photos.
- **Formats:**
  - prices as "R1,250" (ledger views show cents);
  - 24-hour times with "SAST";
  - weeks start on Monday;
  - British/South African spelling.
- **Stack:** ported from the Baleka Fitness Site template:
  - Next.js 16 App Router, React 19, TypeScript, Tailwind 4, zod 4;
  - Postgres (Supabase in production, PGlite locally);
  - GSAP and Lenis;
  - hosted on Vercel.

  The production host and plan, the database region and the email provider are open decisions.
- **Performance budgets:**
  - mobile LCP of 2.5 s or less;
  - site CSS of 30 KB gzipped or less;
  - motion code loads only after the visitor interacts, and never under reduced motion.
- **Security:**
  - OWASP ASVS Level 2;
  - deny-by-default permissions, checked in pages, actions, route handlers and services;
  - TOTP MFA for owner and admin;
  - an append-only audit log;
  - encryption at rest for channel URLs, API keys and any guest ID numbers.
- **SARS:** the dashboard prepares, exports and tracks returns. It never files them. Every return page says the figures need review by the owner or their accountant. Tax rates, thresholds and deadlines are dated, versioned config that cites sars.gov.za.
- **POPIA:**
  - a notice and consent on every form;
  - purpose limitation;
  - a retention schedule;
  - data-subject requests.

  ID or passport numbers are collected only if the client confirms a legal need.

## Brand Commitments

- **Name:** "Romaic Guesthouse" (confirmed). Always spell it "Guesthouse"; the repository's `romaic-ghesthouse` spelling is a folder name only. Whether to add "Welkom" is open.
- **Leads, not yet binding (confirm with the client):**
  - the tagline "Spacious. Comfortable. Reliable.", from the host's listing;
  - the multicoloured geometric tile logo on the street sign at 286 Stateway (red, blue, green and yellow shapes). The logo file is still to be requested. Design may reference these but must not depend on them until confirmed.
- **Voice:** plain, warm and direct; sentence case; British/South African spelling.
- **Must not feel like (confirmed 2026-11-12):**
  - a generic hotel chain, interchangeable and corporate;
  - safari-lodge clichés: bushveld, thatch, animal print, "African sunset" stock imagery that isn't Welkom;
  - over-luxurious, promising a resort the guesthouse doesn't claim.

## Evidence on Hand

- **Property facts:** extracted from the Booking.com listing on 2026-11-12, each with a source, in `docs/planning/property-facts.md` (local only). They cover:
  - address and area;
  - seven room types with beds, occupancy and in-room facilities;
  - property facilities, including backup water, power and gas;
  - security features;
  - house rules and check-in times;
  - nearby restaurants and stations.

  Unconfirmed by the client.
- **Photos:** none usable. The listing's 45 photos are Booking.com uploads and may not be copied. The site uses clearly labelled stand-in photos (`data-placeholder`) until the client supplies originals. A shot list is in `property-facts.md`.
- **Not on hand, so never invent:**
  - prices;
  - room sizes;
  - units per type;
  - star grading. Booking.com's "3 out of 5" quality rating is not a star grading and is never shown as stars;
  - awards;
  - reviews or ratings for the site (Booking.com reviews can't be copied);
  - staff or host names;
  - distances beyond the listing's estimates;
  - breakfast terms;
  - direct-booking policies.

## Product Principles

1. **Answer "is it free, will it fit, what does it cost" first.** A guest sees real availability and the room that suits their group faster than they could message.
2. **Show reliability; don't claim it.** Name the backup water, gas and power, the fence and the parking, specifically and truthfully. Generic "peace of mind" copy is not enough.
3. **Only sourced facts.** Every fact traces to the listing, the client or Weberu. Stand-ins are labelled and nothing is rounded up.
4. **Phone-first for guests and team.** Guests compare on phones; the team runs the house from phones between tasks.
5. **The owner controls the business.** Content, rooms and rates are editable without the agency. Finance is the owner's alone, and Weberu never sees it.

## Accessibility & Inclusion

- WCAG 2.2 AA:
  - a label on every input;
  - a visible focus ring;
  - status never shown by colour alone;
  - fully keyboard operable;
  - 44 px touch targets on phones.
- Reduced motion is honoured, and no motion code loads under it.
- One room type is listed as wheelchair accessible, with grab rails. Describe accessibility features precisely and honestly (what exists, what doesn't), so guests with disabilities can decide for themselves.
- Pages stay light for guests on mobile data.
