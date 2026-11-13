import { z } from "zod";
import { isoDateField, listField, placeholderTextField, refineUnique, slugField, textField, versionField, wholeNumberField } from "./fields";
import { listLimits, textLimits } from "./limits";
import { contentIcons, imageRefSchema, timeOfDayField } from "./shapes";

/**
 * The public pages' own content, one schema per section (./schema keeps the
 * registry). Layout is fixed in code; these fill it.
 *
 * Facts that came from somewhere other than the client's own materials (the
 * Booking.com listing, mostly) carry `confirmed: false` until the owner
 * ticks them off in the dashboard. The site marks an unconfirmed fact as a
 * placeholder (data-placeholder, with a visible "To confirm" tag), so no one
 * mistakes it for something the owner has said (brief rule 2).
 *
 * A new field inside list items needs its own `.default(…)` (see ./schema).
 */

const confirmedField = z.boolean({ error: "Reload the page and try again: part of this form didn't arrive as expected." });

function heading(noun = "the heading") {
  return textField({ noun, max: textLimits.heading, required: `Enter ${noun}.` });
}

function intro(noun = "the introduction") {
  return textField({ noun, max: textLimits.intro, multiline: true });
}

// --- home ------------------------------------------------------------------------------

/** One of the poster's rows: an icon, a title and a line or two ("In your room"). */
export const highlightSchema = z.object({
  icon: z.enum(contentIcons, { error: "Choose an icon." }),
  title: textField({ noun: "the title", max: textLimits.label, required: "Enter the title, like In your room." }),
  lines: listField(textField({ noun: "each line", max: textLimits.listLine, required: "Enter the line, or remove it." }), listLimits.highlightLines, {
    one: "line",
    many: "lines",
  }),
});

export type Highlight = z.output<typeof highlightSchema>;

/**
 * The home page. Two parts arrived with the premium design (2026-11-13) and
 * are optional, so content saved before them still validates: the service
 * lays stored content over the defaults (./service.ts), so a home section
 * saved without them reads with the defaults' photo and evening band, and a
 * save from an editor that doesn't show them yet leaves them out and gets
 * the defaults back on the next read.
 */
export const homeSchema = z.object({
  hero: z.object({
    /** The headline over the photograph. */
    headline: textField({ noun: "the headline", max: textLimits.goldBar, required: "Enter the headline." }),
    lead: textField({ noun: "the introduction", max: textLimits.lead, required: "Enter a sentence or two about the guesthouse." }),
    /** A few words of welcome, the heading of the page's closing invitation to book; "" leaves it to the Book page's heading. */
    welcome: textField({ noun: "the welcome line", max: textLimits.script }),
    photo: imageRefSchema,
  }),
  apartments: z.object({ heading: heading(), intro: intro() }),
  highlights: z.object({
    heading: heading(),
    intro: intro(),
    items: listField(highlightSchema, listLimits.highlights, { one: "highlight", many: "highlights" }),
    /** The framed photo beside the highlights. Optional (see above). */
    photo: imageRefSchema.optional(),
  }),
  /** The navy band with the check-in and check-out times and two photos. Optional (see above). */
  evenings: z
    .object({
      heading: heading(),
      intro: intro(),
      photos: listField(imageRefSchema, listLimits.eveningPhotos, { one: "photo", many: "photos" }),
    })
    .optional(),
  location: z.object({ heading: heading(), text: intro("the text") }),
});

// --- apartments ------------------------------------------------------------------------

export const apartmentSchema = z.object({
  /** The page's address (/rooms/<slug>) and how units are assigned to it. */
  slug: slugField("the link name"),
  name: textField({ noun: "the name", max: textLimits.label, required: "Enter the room's name." }),
  /** One sentence for the room's card. */
  summary: textField({ noun: "the summary", max: textLimits.listLine * 2, required: "Enter a sentence about the room for its card." }),
  /** Paragraphs for the room's page; "" for none. */
  description: textField({ noun: "the description", max: textLimits.passage, multiline: true }),
  /** The most guests it sleeps: the Book page offers it to groups up to this size. */
  sleeps: wholeNumberField({ noun: "how many it sleeps", min: 1, max: 12 }),
  beds: textField({ noun: "the beds", max: textLimits.listLine, required: "Enter the beds, like 1 single and 1 large double." }),
  bathroom: textField({ noun: "the bathroom", max: textLimits.listLine, required: "Enter the bathroom, like Private, with a shower." }),
  /** "" for none. */
  view: textField({ noun: "the view", max: textLimits.label }),
  features: listField(textField({ noun: "each feature", max: textLimits.label, required: "Enter the feature, or remove it." }), listLimits.apartmentFeatures, {
    one: "feature",
    many: "features",
  }),
  /** What a guest with a disability needs to know, exactly as it is; "" for nothing special. */
  accessibility: textField({ noun: "the accessibility details", max: textLimits.rule, multiline: true }),
  photos: listField(imageRefSchema, listLimits.apartmentPhotos, { one: "photo", many: "photos" }),
  /** The owner has checked the name, beds, bathroom, features and sleeps. */
  confirmed: confirmedField,
  /** Shown on the site and offered on the Book page. */
  published: z.boolean(),
});

export type Apartment = z.output<typeof apartmentSchema>;

export const apartmentsSchema = z.object({
  heading: heading(),
  intro: intro(),
  items: listField(apartmentSchema, listLimits.apartments, { one: "room type", many: "room types" }).superRefine((items, context) =>
    refineUnique(items, context, { key: (item) => item.slug, field: "slug", message: "Another room type already uses this link name." }),
  ),
});

// --- facilities ------------------------------------------------------------------------

export const facilitySchema = z.object({
  icon: z.enum(contentIcons, { error: "Choose an icon." }),
  label: textField({ noun: "the facility", max: textLimits.label, required: "Enter the facility, or remove it." }),
  /** A short note, such as "at an extra charge"; "" for none. */
  note: textField({ noun: "the note", max: textLimits.label }),
  confirmed: confirmedField,
});

export type Facility = z.output<typeof facilitySchema>;

export const facilityGroupSchema = z.object({
  title: textField({ noun: "the group's name", max: textLimits.heading, required: "Enter the group's name, like Security." }),
  items: listField(facilitySchema, listLimits.facilities, { one: "facility", many: "facilities" }),
});

export type FacilityGroup = z.output<typeof facilityGroupSchema>;

export const facilitiesSchema = z.object({
  heading: heading(),
  intro: intro(),
  groups: listField(facilityGroupSchema, listLimits.facilityGroups, { one: "group", many: "groups" }),
});

// --- location and area -----------------------------------------------------------------

export const nearbyPlaceSchema = z.object({
  name: textField({ noun: "the place's name", max: textLimits.label, required: "Enter the place's name." }),
  /** What it is: "Restaurant", "Train station". */
  kind: textField({ noun: "what kind of place it is", max: textLimits.label, required: "Say what kind of place it is, like Restaurant." }),
  /** "About 320 m"; "" when it isn't known. */
  distance: textField({ noun: "the distance", max: textLimits.label }),
  confirmed: confirmedField,
});

export type NearbyPlace = z.output<typeof nearbyPlaceSchema>;

export const locationSchema = z.object({
  heading: heading(),
  intro: intro(),
  /** How to get here and where to park; "" for none. */
  directions: textField({ noun: "the directions", max: textLimits.passage, multiline: true }),
  nearby: z.object({
    heading: heading(),
    /** Shown under the list, such as how the distances were measured. */
    note: intro("the note"),
    places: listField(nearbyPlaceSchema, listLimits.nearbyPlaces, { one: "place", many: "places" }),
  }),
});

// --- policies --------------------------------------------------------------------------

export const timeWindowSchema = z
  .object({ from: timeOfDayField, until: timeOfDayField, confirmed: confirmedField })
  .refine((window) => window.until > window.from, { message: "Make the end time later than the start time.", path: ["until"] });

export type TimeWindow = z.output<typeof timeWindowSchema>;

export const houseRuleSchema = z.object({
  title: textField({ noun: "the rule's title", max: textLimits.label, required: "Enter the rule's title, like Children." }),
  text: textField({ noun: "the rule", max: textLimits.rule, required: "Enter the rule, or remove it.", multiline: true }),
  confirmed: confirmedField,
});

export type HouseRule = z.output<typeof houseRuleSchema>;

export const policiesSchema = z.object({
  heading: heading(),
  intro: intro(),
  checkIn: timeWindowSchema,
  checkOut: timeWindowSchema,
  rules: listField(houseRuleSchema, listLimits.rules, { one: "rule", many: "rules" }),
});

/**
 * Terms that move money (roles.md, settings:booking-rules: the owner only).
 * Each is "" until the owner sets it; the Policies page then shows a marked
 * placeholder rather than guessing.
 */
export const bookingTermsSchema = z.object({
  deposit: textField({ noun: "the deposit terms", max: textLimits.rule, multiline: true }),
  balance: textField({ noun: "when the balance is due", max: textLimits.rule, multiline: true }),
  cancellation: textField({ noun: "the cancellation terms", max: textLimits.rule, multiline: true }),
  payment: textField({ noun: "how guests can pay", max: textLimits.rule, multiline: true }),
});

// --- gallery ---------------------------------------------------------------------------

export const galleryPhotoSchema = z.object({
  photo: imageRefSchema,
  /** "" for none. */
  caption: textField({ noun: "the caption", max: textLimits.caption }),
});

export type GalleryPhoto = z.output<typeof galleryPhotoSchema>;

export const gallerySchema = z.object({
  heading: heading(),
  intro: intro(),
  photos: listField(galleryPhotoSchema, listLimits.galleryPhotos, { one: "photo", many: "photos" }),
});

// --- book ------------------------------------------------------------------------------

export const bookSchema = z.object({
  heading: heading(),
  intro: intro(),
  /** Above the request form: that it's a request, and how the owner replies. */
  requestNote: intro("the note above the form"),
  /**
   * The consent the form asks for (POPIA). Each request records the version
   * it was sent under, so a change to the wording gets a new version and
   * date by itself (./versioning.ts).
   */
  consent: z.object({
    label: textField({ noun: "the consent wording", max: textLimits.consent, required: "Enter what guests agree to when they send a request." }),
    version: versionField,
    updatedOn: isoDateField("the date it was last changed"),
  }),
  confirmation: z.object({
    heading: heading(),
    /** What happens next, after a request is sent. */
    text: intro("what happens next"),
  }),
});

// --- guest messages --------------------------------------------------------------------

/**
 * What a booking's WhatsApp messages can fill in. The booking's own details
 * come from the booking; the business's from content; check-in times from
 * the house rules.
 */
export const messagePlaceholders = [
  "guestName",
  "ref",
  "room",
  "arrive",
  "leave",
  "nights",
  "businessName",
  "location",
  "phone",
  "checkInFrom",
  "checkInUntil",
  "checkOutUntil",
] as const;

/**
 * Placeholders' former names, which messages saved earlier may still use:
 * {room} was {apartment} until the client confirmed Romaic has rooms, never
 * apartments. They're accepted and filled in, but never suggested.
 */
export const formerMessagePlaceholders = ["apartment"] as const;

export type MessagePlaceholder = (typeof messagePlaceholders)[number] | (typeof formerMessagePlaceholders)[number];

function messageText(noun: string) {
  return placeholderTextField({
    noun,
    max: textLimits.rule * 2,
    required: `Enter ${noun}.`,
    multiline: true,
    placeholders: messagePlaceholders,
    formerPlaceholders: formerMessagePlaceholders,
  });
}

/**
 * WhatsApp messages the team sends from a booking (wa.me links, never sent
 * by themselves). Owner only (settings:booking-rules): they're the words
 * guests act on, so they mustn't change without the owner (threat model T01).
 */
export const messagesSchema = z.object({
  confirmation: messageText("the confirmation message"),
  directions: messageText("the directions message"),
  checkIn: messageText("the check-in message"),
});

// --- contact page ----------------------------------------------------------------------

export const contactPageSchema = z.object({
  heading: heading(),
  intro: intro(),
  /** How soon guests can expect a reply; "" for nothing. */
  responseNote: textField({ noun: "the reply note", max: textLimits.listLine }),
});
