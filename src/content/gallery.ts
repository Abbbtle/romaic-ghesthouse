import type { GallerySection } from "@/lib/content/schema";
import { standIns } from "./stand-ins";

/**
 * The gallery: labelled stand-in photos until the client's own arrive. Each
 * says on its face that it's a stand-in, and where it's from. Captions stay
 * empty, because a caption would describe Romaic, and these aren't Romaic.
 */
export const galleryDefaults: GallerySection = {
  heading: "Gallery",
  intro: "A look around the guesthouse and the rooms.",
  photos: [
    standIns.redBedding,
    standIns.twinBeds,
    standIns.bathtub,
    standIns.seatingCorner,
    standIns.shower,
    standIns.coffeeTray,
    standIns.patio,
    standIns.braai,
    standIns.lawn,
    standIns.warmBedroom,
  ].map((photo) => ({ photo, caption: "" })),
};
