import type { ImageRef } from "@/lib/content/schema";

/**
 * The labelled stand-in photos the default content uses until the client's
 * own arrive (brief rule 3; public/stand-ins/SOURCES.md). The site works out
 * that each is a stand-in from its address and labels it on its face. The
 * descriptions say what the photo shows and never claim it's Romaic.
 */
function standIn(id: number, width: number, height: number, alt: string): ImageRef {
  return { src: `/stand-ins/pexels-${id}.jpg`, alt, width, height, focus: { x: 50, y: 50 } };
}

export const standIns = {
  warmBedroom: standIn(279746, 1600, 1014, "A bedroom with warm bedside lamps and a wooden headboard"),
  doubleBed: standIn(164595, 1600, 1067, "A made double bed with a warm wall lamp"),
  deskBedroom: standIn(271618, 1600, 1068, "A bright bedroom with a desk and laptop"),
  twinBeds: standIn(36418598, 1600, 1067, "Two single beds under one headboard, with the bedside lamps on"),
  bathtub: standIn(7167074, 1600, 1068, "A white bathtub against dark brown tiles edged with gold mosaic"),
  seatingCorner: standIn(7609139, 1600, 1067, "A bedroom corner with an upholstered chair and a lit table lamp against a red wall"),
  shower: standIn(16342171, 1600, 1067, "A small bathroom with a glass walk-in shower and a wooden vanity"),
  patio: standIn(802577, 1600, 1067, "A wooden table and chairs in a courtyard at night, under an umbrella strung with fairy lights"),
  braai: standIn(3619859, 1600, 1067, "A cast-iron pot and sausage cooking over coals in a brick braai"),
  lawn: standIn(35539547, 1600, 1200, "Two wooden deck chairs and a closed umbrella on a garden lawn"),
  coffeeTray: standIn(2952663, 1600, 1067, "A tray with a coffee press, a cup and chocolate biscuits beside a made bed"),
  redBedding: standIn(7028122, 1600, 1067, "A made double bed with a red throw and red cushions, both lamps on"),
} as const;
