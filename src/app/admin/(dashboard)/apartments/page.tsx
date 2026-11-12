import type { Metadata } from "next";
import { adminRoutes } from "@/components/admin/admin-routes";
import { ApartmentsScreen, type ApartmentGroup, type ClosureRow } from "@/components/admin/apartments/apartments-screen";
import { contentEditorHref } from "@/components/admin/content/content-sections";
import { can } from "@/lib/accounts/access";
import { stayLabel } from "@/lib/inventory/stays";
import { blockReasonNames } from "@/lib/inventory/units";
import { requireDashboardActor } from "@/server/admin-session";
import { inventoryService } from "@/server/stays";
import { addUnit, closeNights, openNights, setUnitOffered } from "./actions";

export const metadata: Metadata = { title: "Apartments" };

/**
 * Units and closed nights, for the owner and sales (availability:view to
 * see, rates:manage to change). Never admin or staff.
 */
export default async function ApartmentsPage() {
  const actor = await requireDashboardActor({ permission: "availability:view" });
  const overview = await inventoryService().overview(actor);
  const unitsById = new Map(overview.units.map((unit) => [unit.id, unit]));
  const typeNames = new Map(overview.apartmentTypes.map((type) => [type.slug, type.name]));
  const apartments: ApartmentGroup[] = overview.apartmentTypes.map((type) => ({
    slug: type.slug,
    name: type.name,
    shown: type.published,
    units: overview.units.filter((unit) => unit.apartment === type.slug).map((unit) => ({ id: unit.id, name: unit.name, offered: unit.active })),
  }));
  const closures: ClosureRow[] = overview.blocks.map((block) => {
    const unit = unitsById.get(block.unitId);
    return {
      id: block.id,
      unitName: unit?.name ?? "A unit",
      apartmentName: (unit && typeNames.get(unit.apartment)) ?? "",
      nights: stayLabel(block.stay),
      reason: blockReasonNames[block.reason],
      note: block.note,
      removable: block.reason !== "request",
    };
  });
  const unitOptions = overview.units
    .filter((unit) => unit.active && typeNames.has(unit.apartment))
    .map((unit) => ({ value: unit.id, label: `${unit.name} (${typeNames.get(unit.apartment)})` }));
  return (
    <ApartmentsScreen
      apartments={apartments}
      orphans={overview.orphanUnits.map((unit) => ({ id: unit.id, name: unit.name, offered: unit.active }))}
      closures={closures}
      unitOptions={unitOptions}
      today={overview.today}
      canManage={can(actor, "rates:manage")}
      actions={{ addUnit, closeNights, setUnitOffered, openNights }}
      websiteHref={can(actor, "content:edit") ? contentEditorHref("apartments") : adminRoutes.apartments}
    />
  );
}
