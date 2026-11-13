import { z } from "zod";
import { percentField, textField } from "./fields";
import { textLimits } from "./limits";

/**
 * Shapes several sections share: the curated icons, photos (including the
 * labelled stand-ins the site shows until the client's own arrive) and
 * times of day. ./schema builds the sections from them.
 */

// --- icons ---------------------------------------------------------------------------

/**
 * The line icons content can pick, for amenities, facilities and the home
 * page's highlights. Components map each to a drawing
 * (src/components/site/amenity-icon.tsx), one family at one weight.
 */
export const contentIcons = [
  "apartment",
  "bed",
  "coffee",
  "water",
  "geyser",
  "wifi",
  "fence",
  "camera",
  "enclosed",
  "tank",
  "microwave",
  "iron",
  "walk",
  "parking",
  "kitchen",
  "bath",
  "desk",
  "tv",
  "garden",
  "braai",
  "housekeeping",
  "laundry",
  "invoice",
  "family",
  "accessible",
  "clock",
  "map-pin",
  "no-smoking",
  "no-pets",
  "quiet",
  "key",
] as const;

export type ContentIcon = (typeof contentIcons)[number];

export const contentIconNames: Record<ContentIcon, string> = {
  apartment: "Room",
  bed: "Bed",
  coffee: "Coffee cup",
  water: "Glass of water",
  geyser: "Flame (hot water)",
  wifi: "Wi-Fi",
  fence: "Fence",
  camera: "Security camera",
  enclosed: "Shield",
  tank: "Water tank",
  microwave: "Microwave",
  iron: "Iron",
  walk: "Footsteps",
  parking: "Car",
  kitchen: "Cooking pot",
  bath: "Bath",
  desk: "Desk lamp",
  tv: "Television",
  garden: "Tree",
  braai: "Braai",
  housekeeping: "Sparkles",
  laundry: "Washing machine",
  invoice: "Receipt",
  family: "Family",
  accessible: "Wheelchair",
  clock: "Clock",
  "map-pin": "Map pin",
  "no-smoking": "No smoking",
  "no-pets": "No pets",
  quiet: "Moon (quiet hours)",
  key: "Key",
};

// --- photos ----------------------------------------------------------------------------

/**
 * Where a photo may come from:
 * - /images/…: a default photo shipped with the site;
 * - /stand-ins/pexels-<id>.jpg: a labelled stand-in, until the client's own
 *   photos arrive (brief rule 3; public/stand-ins/SOURCES.md);
 * - /media/<uuid>: a photo uploaded in the dashboard.
 */
const imageSrcPattern =
  /^\/(?:images\/[A-Za-z0-9][\w-]*(?:\.[\w-]+)*\.(?:jpe?g|png|webp|avif)|stand-ins\/pexels-\d{1,12}\.jpe?g|media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

const standInPattern = /^\/stand-ins\/pexels-(\d{1,12})\.jpe?g$/;

/**
 * Where a stand-in photo comes from, such as "Pexels 279746", or null for a
 * real photo. Worked out from the address, never stored, so replacing the
 * photo in the dashboard is the only way to lose the label, and that's the
 * moment it stops being a stand-in.
 */
export function standInSource(src: string): string | null {
  const match = standInPattern.exec(src);
  return match ? `Pexels ${match[1]}` : null;
}

const imageDimension = z.number({ error: "Upload the photo again." }).int("Upload the photo again.").min(1, "Upload the photo again.").max(8192, "Upload the photo again.");

/**
 * A photo with its pixel size (for next/image), required alt text, and the
 * point to keep in frame when it's cropped, in percent from the top left.
 */
export const imageRefSchema = z.object({
  src: z
    .string({ error: "Choose a photo." })
    .max(textLimits.url, "Upload the photo again: its address isn't one this site serves.")
    .regex(imageSrcPattern, "Upload the photo again: its address isn't one this site serves."),
  alt: textField({ noun: "the photo description", max: textLimits.imageAlt, required: "Describe the photo for people who can't see it." }),
  width: imageDimension,
  height: imageDimension,
  focus: z.object({ x: percentField, y: percentField }).default(() => ({ x: 50, y: 50 })),
});

export type ImageRef = z.output<typeof imageRefSchema>;

// --- times of day ----------------------------------------------------------------------

/** A time on the 24-hour clock, "15:00", as the site shows times (SAST). */
export const timeOfDayField = z
  .string({ error: "Enter a time, like 15:00." })
  .trim()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Enter a time on the 24-hour clock, like 15:00.");
