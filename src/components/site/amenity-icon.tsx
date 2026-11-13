import {
  BedDouble,
  Car,
  Cctv,
  Coffee,
  Container,
  Fence,
  Flame,
  Footprints,
  GlassWater,
  Microwave,
  Shirt,
  ShieldCheck,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import type { AmenityIcon } from "./romaic-facts";

/**
 * Line icons for amenities, one family (lucide) at one stroke weight, in
 * gold on light grounds as the brand's posters set them. Decorative: the
 * amenity's words always sit beside the icon.
 */
const icons: Record<AmenityIcon, LucideIcon> = {
  apartment: BedDouble,
  coffee: Coffee,
  water: GlassWater,
  geyser: Flame,
  wifi: Wifi,
  fence: Fence,
  camera: Cctv,
  enclosed: ShieldCheck,
  tank: Container,
  microwave: Microwave,
  iron: Shirt,
  walk: Footprints,
  parking: Car,
};

export function AmenityIconGlyph({ icon, className }: { icon: AmenityIcon; className?: string }) {
  const Icon = icons[icon];
  return <Icon aria-hidden="true" strokeWidth={1.5} className={className} />;
}
