import {
  Accessibility,
  Bath,
  Bed,
  BedDouble,
  Beef,
  Car,
  Cctv,
  CigaretteOff,
  Clock,
  Coffee,
  Container,
  CookingPot,
  Fence,
  Flame,
  Footprints,
  GlassWater,
  KeyRound,
  LampDesk,
  MapPin,
  Microwave,
  Moon,
  PawPrint,
  Receipt,
  Shirt,
  ShieldCheck,
  Sparkles,
  Trees,
  Tv,
  Users,
  WashingMachine,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import type { AmenityIcon } from "./romaic-facts";

/**
 * Line icons for amenities, one family (lucide) at one stroke weight, in
 * gold on light grounds as the brand's posters set them. Decorative: the
 * amenity's words always sit beside the icon. "No pets" uses a paw print;
 * the words beside it say what the rule is.
 */
const icons: Record<AmenityIcon, LucideIcon> = {
  apartment: BedDouble,
  bed: Bed,
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
  kitchen: CookingPot,
  bath: Bath,
  desk: LampDesk,
  tv: Tv,
  garden: Trees,
  braai: Beef,
  housekeeping: Sparkles,
  laundry: WashingMachine,
  invoice: Receipt,
  family: Users,
  accessible: Accessibility,
  clock: Clock,
  "map-pin": MapPin,
  "no-smoking": CigaretteOff,
  "no-pets": PawPrint,
  quiet: Moon,
  key: KeyRound,
};

export function AmenityIconGlyph({ icon, className }: { icon: AmenityIcon; className?: string }) {
  const Icon = icons[icon];
  return <Icon aria-hidden="true" strokeWidth={1.5} className={className} />;
}
