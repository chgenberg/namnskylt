import {
  createBadgeDocument,
  withBlank,
  withMarking,
  withTextColor,
  type BadgeDocument,
  type BadgeLogo,
  type BlankId,
  type MountingId,
} from "@/engine";
import { INSPIRATION } from "@/lib/inspiration/catalog";

/**
 * Exempelskyltarna på sidorna om namnskyltar (2026-11-25), byggda med motorns egna funktioner så att de
 * alltid går att beställa: knappen "Gör en sådan skylt" öppnar just den skylten i skyltmotorn. Namnen och
 * yrkena är påhittade, och loggan är ett påhittat märke, inget riktigt företags.
 */

type Point = readonly [number, number];
const round = (n: number) => Math.round(n * 10) / 10;
const polygon = (points: readonly Point[]) => `M${points.map(([x, y]) => `${round(x)} ${round(y)}`).join("L")}Z`;

function circle(cx: number, cy: number, r: number, steps = 64): Point[] {
  return Array.from({ length: steps }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / steps), cy + r * Math.sin((2 * Math.PI * i) / steps)]);
}

/** En kubisk kurva som punkter, utan slutpunkten (den börjar nästa kurva). */
function cubic(a: Point, b: Point, c: Point, d: Point, steps = 16): Point[] {
  return Array.from({ length: steps }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    return [
      u ** 3 * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t ** 3 * d[0],
      u ** 3 * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t ** 3 * d[1],
    ];
  });
}

/**
 * Ett påhittat märke: ett löv med nerv, urtaget ur en cirkel. Loggans bana får bara ha raka linjer (som en
 * spårad logga), och ritas med evenodd: lövet blir ett hål och nerven fylls igen.
 */
const EXAMPLE_LOGO_D = [
  polygon(circle(60, 60, 60)),
  polygon([...cubic([34, 88], [34, 58], [50, 38], [88, 32]), ...cubic([88, 32], [84, 66], [66, 86], [34, 88])]),
  polygon([
    [43, 81],
    [79, 43],
    [82, 46],
    [46, 84],
  ]),
].join("");

function exampleLogo(placement: BadgeLogo["placement"], heightMm: number): BadgeLogo {
  return { d: EXAMPLE_LOGO_D, viewWidth: 120, viewHeight: 120, placement, heightMm };
}

/** Namn och titel: namnet större och fetare, titeln under. */
function named(doc: BadgeDocument, name: string, title: string, nameMm = 6, titleMm = 3.4): BadgeDocument {
  const [first, second] = createBadgeDocument([name, title]).rows;
  return {
    ...doc,
    rows: [
      { ...first!, capHeightMm: nameMm, bold: true },
      { ...second!, capHeightMm: titleMm, bold: false },
    ],
  };
}

/** En metallskylt: printas alltid. */
function metal(colorId: "metal-gold" | "metal-silver" | "metal-white", blank: BlankId, mounting: MountingId): BadgeDocument {
  return { ...withBlank(createBadgeDocument(), blank), colorId, mounting };
}

/** En plastskylt som graveras: utan fältet `marking` gäller gravyr, som plastens förval. */
function plastic(colorId: string, blank: BlankId, mounting: MountingId): BadgeDocument {
  const doc: BadgeDocument = { ...withBlank(createBadgeDocument(), blank), materialId: "plastic", colorId, mounting };
  delete doc.marking;
  return doc;
}

const inspiration = (slug: string): BadgeDocument => {
  const entry = INSPIRATION.find((item) => item.slug === slug);
  if (!entry) throw new Error(`Inspirationsbanken saknar ${slug}`);
  return entry.doc;
};

/** Exempelskylten per sida, på sidans adress. */
export const TOPIC_EXAMPLES: Record<string, BadgeDocument> = {
  "med-logga": withTextColor(
    { ...named(metal("metal-white", "metal-rectangle", "magnet"), "Anna Berg", "Projektledare", 5, 3), logo: exampleLogo("left", 14) },
    "#1F6B4A",
  ),
  metall: named(metal("metal-gold", "metal-rectangle", "pin"), "Erik Holm", "Säljare"),
  plast: named(plastic("darkblue-white", "rectangle", "pin"), "Sara Ek", "Kundtjänst"),
  "med-magnet": named(metal("metal-silver", "metal-oval", "magnet"), "Karin Ström", "Receptionist", 5, 3),
  "med-nal": named(plastic("black-white", "rectangle", "pin"), "Jonas Ali", "Tekniker"),
  "med-klamma": inspiration("lakare"),
  "egen-form": inspiration("bil"),
  vard: named(plastic("white-blue", "rectangle-long", "clip"), "Lena Nyberg", "Sjuksköterska"),
  "restaurang-och-hotell": named(metal("metal-gold", "metal-oval", "magnet"), "Sofia Berg", "Hovmästare", 5, 3),
  butik: withMarking(
    { ...named(plastic("red-white", "rectangle", "pin"), "Johan Nilsson", "Butikschef", 5.5, 3.2), logo: exampleLogo("left", 14) },
    "engrave",
  ),
  "massa-och-event": withTextColor(
    { ...named(metal("metal-white", "metal-tv", "magnet"), "Maja Lind", "Kundansvarig", 5, 3), logo: exampleLogo("top", 8) },
    "#1D4E89",
  ),
};
