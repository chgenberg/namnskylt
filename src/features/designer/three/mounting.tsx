import { useEffect, useMemo } from "react";
import { BufferGeometry, Float32BufferAttribute, Path, Shape } from "three";
import {
  CLIP_FIT,
  CLIP_FOLD_REACH_MM,
  clipOrientationOf,
  clipPlate,
  fitHardware,
  type BadgeDocument,
  type FontEngine,
  type HardwareFootprint,
  type MountingId,
} from "@/engine";
import { glyphShapes, UNITS_PER_MM } from "./geometry";

/**
 * Fästena på skyltens baksida, byggda efter foton av verkstadens egna fästen
 * (underlag från ägaren 2026-11-16):
 * - nålen: en svart plastlist på en vit skumtejp, med gångjärn i ena änden,
 *   lås i den andra och en stålnål som står öppen,
 * - magneten: en tunn förnicklad platta på skylten och en svart hållare med
 *   rundade ändar och texten CAUTION MAGNETIC,
 * - klämman: en stålplatta på 80 × 25 mm med en fjäderarm vikt över ena änden,
 *   ett fönster med en tunga i armen och en uppvikt läpp längst ut. Skylten
 *   ligger kant i kant med plattan (`clipPlate` i motorn), och vikningen
 *   sticker ut 4 mm utanför den: klämman är 84 mm lång och skylten 80.
 *
 * Ikonerna i panelen (`mounting-section.tsx`) är förenklade och ritas för sig.
 * Måtten är i mm och har tak, så fästet växer inte med en stor skylt. Samma
 * mått styr ytan fästet tar på baksidan (`footprint`).
 */

/** Satinmatt stål, som klämman: ljust från alla håll, utan att spegla rummet. */
const STEEL = "#d3d7dc";
/** Plåten under klämmans arm ligger i skugga. */
const STEEL_SHADE = "#a3a9b1";
const NICKEL = "#dfe2e5";
const BLACK_PLASTIC = "#1b1c1f";
const FOAM_TAPE = "#e8e8e4";
/** Hur högt över skyltens mitt fästet sitter, som andel av höjden. */
const HARDWARE_RISE: Record<MountingId, number> = { pin: 0.08, magnet: 0, clip: 0, "safety-pin": 0.12 };
const mm = UNITS_PER_MM;

interface HardwareSize {
  /** Längs skylten. */
  longMm: number;
  /** Tvärs över skylten. */
  wideMm: number;
  /** Hörnens rundning, för klämmans platta som följer skyltens hörn. */
  cornerMm?: number;
}

function pinSize(widthMm: number): HardwareSize {
  return { longMm: Math.min(widthMm * 0.46, 34), wideMm: 7 };
}

function magnetSize(widthMm: number, heightMm: number): HardwareSize {
  return { longMm: Math.min(widthMm * 0.6, 45), wideMm: Math.min(heightMm * 0.52, 13) };
}

/** Sant när klämman sitter på höjden. En äldre skylt där klämman inte ryms ritas liggande, som förut. */
function clipIsVertical(doc: BadgeDocument): boolean {
  return clipOrientationOf(doc) === "vertical";
}

/**
 * Klämmans platta, längs skylten eller på höjden efter kundens val: 80 × 25 mm,
 * kant i kant med en skylt i det måttet. Reglerna ligger i motorn (`clipPlate`).
 */
function clipSize(doc: BadgeDocument): HardwareSize {
  const plate = clipPlate(doc);
  return { longMm: plate.longMm, wideMm: plate.wideMm, cornerMm: plate.cornerRadiusMm };
}

function hardwareSize(doc: BadgeDocument): HardwareSize {
  const { widthMm, heightMm } = doc.size;
  switch (doc.mounting) {
    case "pin":
      return pinSize(widthMm);
    case "magnet":
      return magnetSize(widthMm, heightMm);
    case "clip":
      return clipSize(doc);
    case "safety-pin":
      return { longMm: widthMm * 0.56 + 4, wideMm: 3 };
  }
}

/** Ytan fästet täcker på baksidan, i mm — samma mått som geometrin nedan. */
function footprint(doc: BadgeDocument, size: HardwareSize): HardwareFootprint {
  // Nålens skumtejp sticker ut en halv millimeter runt listen.
  const tape = doc.mounting === "pin" ? 1 : 0;
  const clip = doc.mounting === "clip";
  // En stående klämma tar sin längd på höjden.
  const upright = clip && clipIsVertical(doc);
  return {
    widthMm: (upright ? size.wideMm : size.longMm) + tape,
    heightMm: (upright ? size.longMm : size.wideMm) + tape,
    centerYMm: doc.size.heightMm * (0.5 - HARDWARE_RISE[doc.mounting]),
    // Klämman ligger kant i kant med skylten; övriga fästen håller luft mot kanten.
    ...(clip ? CLIP_FIT : {}),
  };
}

interface MountingProps {
  doc: BadgeDocument;
  /** Typsnitten, för magnetens präglade text. Utan dem ritas magneten utan text. */
  fonts: FontEngine;
  widthUnits: number;
  heightUnits: number;
  backZ: number;
}

/**
 * Fästet på baksidan. På en egen form flyttas det i höjdled och förminskas vid
 * behov, så att det inte sticker ut bakom en udd eller ett smalt parti.
 */
export function Mounting({ doc, fonts, widthUnits, heightUnits, backZ }: MountingProps) {
  const { mounting } = doc;
  const { size, fit } = useMemo(() => {
    const hardware = hardwareSize(doc);
    const placed = fitHardware(doc, footprint(doc, hardware));
    // På en egen form kan hörnen behöva rundas mer, för att plattan ska följa formens hörn.
    const cornerMm = Math.max(hardware.cornerMm ?? 0, placed.cornerRadiusMm ?? 0);
    return { size: cornerMm > 0 ? { ...hardware, cornerMm } : hardware, fit: placed };
  }, [doc]);
  const lift = (doc.size.heightMm / 2 - fit.centerYMm) * UNITS_PER_MM - HARDWARE_RISE[mounting] * heightUnits * fit.scale;
  return (
    <group position={[0, lift, 0]} scale={[fit.scale, fit.scale, 1]}>
      <group position={[0, heightUnits * HARDWARE_RISE[mounting], backZ]}>
        {mounting === "safety-pin" ? (
          <SafetyPin widthUnits={widthUnits} />
        ) : (
          // Fästena är ritade som de ses bakifrån, i mm: x åt höger, y uppåt och z ut från skyltens baksida.
          <group rotation={[0, Math.PI, 0]} scale={mm}>
            {mounting === "pin" && <Pin size={size} />}
            {mounting === "magnet" && <Magnet size={size} fonts={fonts} />}
            {mounting === "clip" && (
              // Stående klämma: vikningen uppåt, så att läppen öppnar sig nedåt mot fickans kant.
              <group rotation={[0, 0, clipIsVertical(doc) ? -Math.PI / 2 : 0]}>
                <Clip size={size} />
              </group>
            )}
          </group>
        )}
      </group>
    </group>
  );
}

function Steel({ tone = "satin" }: { tone?: "satin" | "shade" | "nickel" }) {
  if (tone === "nickel") return <meshStandardMaterial color={NICKEL} metalness={0.85} roughness={0.3} />;
  return <meshStandardMaterial color={tone === "shade" ? STEEL_SHADE : STEEL} metalness={0.7} roughness={0.46} />;
}

function BlackPlastic() {
  return <meshStandardMaterial color={BLACK_PLASTIC} metalness={0.05} roughness={0.55} />;
}

/** En rektangel med rundade hörn. `target` är en form eller ett hål i en form. */
function roundedRect(target: Shape | Path, width: number, height: number, radius: number, centerX = 0, centerY = 0): void {
  const r = Math.min(radius, width / 2, height / 2);
  const left = centerX - width / 2;
  const right = centerX + width / 2;
  const bottom = centerY - height / 2;
  const top = centerY + height / 2;
  target.moveTo(left + r, bottom);
  target.lineTo(right - r, bottom);
  target.absarc(right - r, bottom + r, r, -Math.PI / 2, 0, false);
  target.lineTo(right, top - r);
  target.absarc(right - r, top - r, r, 0, Math.PI / 2, false);
  target.lineTo(left + r, top);
  target.absarc(left + r, top - r, r, Math.PI / 2, Math.PI, false);
  target.lineTo(left, bottom + r);
  target.absarc(left + r, bottom + r, r, Math.PI, Math.PI * 1.5, false);
}

function roundedRectShape(width: number, height: number, radius: number, centerX = 0, centerY = 0): Shape {
  const shape = new Shape();
  roundedRect(shape, width, height, radius, centerX, centerY);
  return shape;
}

/** En form ur raka kanter, punkt för punkt. */
function polygon(points: readonly (readonly [number, number])[]): Shape {
  const shape = new Shape();
  points.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  return shape;
}

/**
 * En skiva: en form med tjocklek. Med `bevel` rundas kanten, och skivan blir
 * då så mycket större åt alla håll.
 */
const slab = (depth: number, bevel = 0) => ({
  depth,
  bevelEnabled: bevel > 0,
  bevelThickness: bevel,
  bevelSize: bevel,
  bevelSegments: bevel > 0.3 ? 6 : 2,
  curveSegments: 24,
});

/** Segmenten i vikningens halva varv. */
const FOLD_SEGMENTS = 40;

interface FoldShape {
  /** Där vikningen börjar: plattans kortsida. Plåten är vikt ett halvt varv kring x = `foldX`, z = `bend`. */
  foldX: number;
  /** Vikningens halva höjd: armen kommer tillbaka `2 × bend` över plattans undersida. */
  bend: number;
  /** Så långt vikningen sticker ut utanför plattan. */
  reach: number;
  /** Plåtens tjocklek. */
  sheet: number;
  /** Vikningens bredd tvärs över klämman. */
  width: number;
}

/**
 * Klämmans vikning: plåten vikt ett halvt varv, från plattan och tillbaka som
 * fjäderarm. Vikningen börjar vid plattans kortsida och sticker ut utanför den,
 * alltså utanför skylten, som på den riktiga klämman: den är 84 mm lång och
 * skylten 80 (mått från ägaren 2026-11-20). Därför är varvet utdraget, längre
 * än det är högt. Ändarna mot plattan och armen är öppna; de ligger dikt an
 * och syns inte.
 */
function foldGeometry({ foldX, bend, reach, sheet, width }: FoldShape): BufferGeometry {
  const half = width / 2;
  const positions: number[] = [];
  const indices: number[] = [];
  const ring = FOLD_SEGMENTS + 1;
  // En vägg: två rader punkter, en längs var kant. Väggarna delar inga punkter, så kanten mellan dem blir skarp.
  const wall = (inset: number): number => {
    const first = positions.length / 3;
    for (const across of [-half, half]) {
      for (let k = 0; k < ring; k++) {
        const angle = Math.PI / 2 + (Math.PI * k) / FOLD_SEGMENTS;
        positions.push(foldX + (reach - inset) * Math.cos(angle), across, bend + (bend - inset) * Math.sin(angle));
      }
    }
    return first;
  };
  const quad = (a: number, b: number, c: number, d: number) => indices.push(a, b, c, b, d, c);

  const outer = wall(0);
  const inner = wall(sheet);
  for (let k = 0; k < FOLD_SEGMENTS; k++) {
    quad(outer + k, outer + k + ring, outer + k + 1, outer + k + ring + 1);
    quad(inner + k, inner + k + 1, inner + k + ring, inner + k + ring + 1);
  }
  // Gavlarna: plåtens tvärsnitt längs vikningens båda kanter, med egna punkter så att de får en plan yta.
  const outerEnd = wall(0);
  const innerEnd = wall(sheet);
  for (let k = 0; k < FOLD_SEGMENTS; k++) {
    quad(outerEnd + k, outerEnd + k + 1, innerEnd + k, innerEnd + k + 1);
    quad(outerEnd + ring + k, innerEnd + ring + k, outerEnd + ring + k + 1, innerEnd + ring + k + 1);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Hur mycket nålen står öppen, i radianer. På fotot står den ungefär så här. */
const NEEDLE_OPEN = 0.46;

/**
 * Nålen. Listen sitter på en skumtejp. I vänstra änden sitter gångjärnet, där
 * nålen är fäst, och i den högra låset med sin rundade kåpa. Nålen står öppen,
 * som på fotot, så att det syns att den är en nål.
 */
function Pin({ size }: { size: HardwareSize }) {
  const { longMm, wideMm } = size;
  const hingeX = -longMm / 2 + 3.4;
  const catchX = longMm / 2 - 3.4;
  const pivotX = hingeX - 0.6;
  const needleMm = catchX - pivotX + 1.2;
  const { pad, bar, hinge, cap } = useMemo(() => {
    const barShape = roundedRectShape(longMm, wideMm, 1);
    // Den lilla springan mitt på listen.
    const slot = new Path();
    roundedRect(slot, 3.2, 1.1, 0.3);
    barShape.holes.push(slot);
    // Gångjärnets hus har en ränna mot låset, där nålen ligger när den är stängd.
    const left = hingeX - 3;
    const right = hingeX + 3;
    const half = (wideMm - 0.8) / 2;
    const groove = 1;
    return {
      pad: roundedRectShape(longMm + 1, wideMm + 1, 1.3),
      bar: barShape,
      hinge: polygon([
        [left, -half],
        [right, -half],
        [right, -groove],
        [pivotX - 1, -groove],
        [pivotX - 1, groove],
        [right, groove],
        [right, half],
        [left, half],
      ]),
      cap: roundedRectShape(4, wideMm - 2.8, 1.4, catchX),
    };
  }, [longMm, wideMm, hingeX, catchX, pivotX]);
  const pivotZ = 3.7;
  return (
    <group>
      <mesh position={[0, 0, 0.02]}>
        <extrudeGeometry args={[pad, slab(1)]} />
        <meshStandardMaterial color={FOAM_TAPE} metalness={0} roughness={1} />
      </mesh>
      <mesh position={[0, 0, 1.1]}>
        <extrudeGeometry args={[bar, slab(1.2, 0.1)]} />
        <BlackPlastic />
      </mesh>
      <mesh position={[0, 0, 2.5]}>
        <extrudeGeometry args={[hinge, slab(2.1, 0.2)]} />
        <BlackPlastic />
      </mesh>
      {/* Låsets kåpa är rundad upptill, som en liten kudde. */}
      <mesh position={[0, 0, 3.1]}>
        <extrudeGeometry args={[cap, slab(1.2, 0.8)]} />
        <BlackPlastic />
      </mesh>
      {/* Axeln som nålen vrider sig kring. */}
      <mesh position={[pivotX, 0, pivotZ]}>
        <cylinderGeometry args={[0.5, 0.5, 2.6, 16]} />
        <Steel tone="nickel" />
      </mesh>
      {/* Nålen är fäst i gångjärnet och pekar upp ur listen, mot låset. */}
      <group position={[pivotX, 0, pivotZ]} rotation={[0, -NEEDLE_OPEN, 0]}>
        <mesh position={[(needleMm - 2.8) / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.36, 0.36, needleMm - 2.8, 14]} />
          <Steel tone="nickel" />
        </mesh>
        <mesh position={[needleMm - 1.4, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.36, 2.8, 14]} />
          <Steel tone="nickel" />
        </mesh>
      </group>
    </group>
  );
}

/** Magnetens präglade text, två rader mitt på hållaren. Tom utan laddade typsnitt. */
function useMagnetText(fonts: FontEngine, longMm: number, wideMm: number): Shape[] {
  return useMemo(() => {
    if (!fonts.outline) return [];
    try {
      const face = { fontId: "arial", bold: true } as const;
      const capMm = wideMm * 0.2;
      const font = { ...face, sizeMm: capMm / fonts.capHeightRatio(face) };
      const lines = ["CAUTION", "MAGNETIC"];
      const gapMm = capMm * 0.6;
      const top = (wideMm - (capMm * lines.length + gapMm)) / 2;
      const paths = lines.map((line, i) => ({
        d: fonts.outline?.(line, font, (longMm - fonts.measure(line, font)) / 2, top + capMm * (i + 1) + gapMm * i) ?? "",
        fillRule: "nonzero" as const,
      }));
      return glyphShapes({ size: { widthMm: longMm, heightMm: wideMm } }, paths);
    } catch {
      // Texten är en detalj: går konturerna inte att läsa ritas magneten utan den.
      return [];
    }
  }, [fonts, longMm, wideMm]);
}

/**
 * Magneten. Plattan sitter på skylten och den svarta hållaren utanpå plagget.
 * Hållaren vilar på två klackar i ändarna, där magneterna sitter, och är
 * urtagen på mitten.
 */
function Magnet({ size, fonts }: { size: HardwareSize; fonts: FontEngine }) {
  const { longMm, wideMm } = size;
  const text = useMagnetText(fonts, longMm, wideMm);
  // Hållaren är en aning mindre än plattan, så att plattans kant syns runt om.
  const holderLong = longMm - 1.6;
  const holderWide = wideMm - 1.2;
  const round = 0.5;
  const { plate, top, feet } = useMemo(() => {
    const r = holderWide / 2;
    const end = holderLong / 2;
    const inner = holderLong * 0.17;
    const left = new Shape();
    left.moveTo(-inner, -r);
    left.lineTo(-end + r, -r);
    left.absarc(-end + r, 0, r, Math.PI * 1.5, Math.PI / 2, true);
    left.lineTo(-inner, r);
    left.lineTo(-inner, -r);
    const right = new Shape();
    right.moveTo(inner, r);
    right.lineTo(end - r, r);
    right.absarc(end - r, 0, r, Math.PI / 2, -Math.PI / 2, true);
    right.lineTo(inner, -r);
    right.lineTo(inner, r);
    return {
      plate: roundedRectShape(longMm, wideMm, 1.2),
      // Hållaren har helt rundade ändar. Rundningen lägger till `round` runt om, så formen ritas så mycket mindre.
      top: roundedRectShape(holderLong - round * 2, holderWide - round * 2, r - round),
      feet: [left, right],
    };
  }, [longMm, wideMm, holderLong, holderWide]);
  return (
    <group>
      <mesh position={[0, 0, 0.08]}>
        <extrudeGeometry args={[plate, slab(0.6, 0.06)]} />
        <Steel tone="nickel" />
      </mesh>
      {feet.map((foot, i) => (
        <mesh key={i} position={[0, 0, 0.74]}>
          <extrudeGeometry args={[foot, slab(2.3)]} />
          <BlackPlastic />
        </mesh>
      ))}
      <mesh position={[0, 0, 3.5]}>
        <extrudeGeometry args={[top, slab(1.4, round)]} />
        <BlackPlastic />
      </mesh>
      {text.length > 0 && (
        // Konturerna kommer i scenens enheter, så skalan i gruppen ovanför tas tillbaka här.
        <group position={[0, 0, 5.38]} scale={1 / mm}>
          <mesh>
            <extrudeGeometry args={[text, { depth: 0.14 * mm, bevelEnabled: false, curveSegments: 6 }]} />
            <meshStandardMaterial color="#26272b" metalness={0.1} roughness={0.3} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/**
 * Klämman. Plattan sitter längs skylten. I vänstra änden är plåten vikt runt
 * och går tillbaka som en fjäderarm, som trycker mot plattan. Armen har ett
 * fönster med en tunga som pekar ner mot plattan, och slutar i en uppvikt läpp.
 *
 * Plattans hörn har skyltens rundning när klämman ligger kant i kant med den.
 * Vikningen sitter på den raka delen av plattans kortsida, mellan hörnen, och
 * sticker ut utanför plattan (`CLIP_FOLD_REACH_MM`).
 */
function Clip({ size }: { size: HardwareSize }) {
  const { longMm, wideMm } = size;
  const cornerMm = Math.min(size.cornerMm ?? 1.2, longMm / 2, wideMm / 2);
  const sheet = 0.5;
  const bend = 2;
  const armMm = longMm * 0.64;
  // Vikningen och armen sitter på den raka delen av plattans kortsida, mellan de rundade hörnen.
  const armWideMm = Math.max(wideMm * 0.5, Math.min(wideMm - 0.8, wideMm - 2 * cornerMm - 0.3));
  // Vikningen börjar vid plattans kortsida och sticker ut utanför den.
  const foldX = -longMm / 2;
  const armZ = bend * 2 - sheet;
  // Armen lutar från vikningens höjd ner mot plattan, som den nästan når längst ut.
  const tilt = Math.atan((armZ - sheet - 0.15) / armMm);
  const windowMm = armMm * 0.44;
  const windowWideMm = armWideMm * 0.34;
  const windowX = armMm * 0.42;
  const tongueMm = windowMm * 0.74;
  const tongueX = windowX + windowMm / 2;
  // Tungan viks ner tills spetsen nästan når plattan.
  const tongueDrop = Math.asin(Math.min(0.5, Math.sin(tilt) + (armZ - tongueX * Math.tan(tilt) - sheet - 0.35) / tongueMm));
  const lipMm = Math.min(5.5, armMm * 0.14);
  const { base, fold, arm, lip, tongue } = useMemo(() => {
    const half = armWideMm / 2;
    const armShape = polygon([
      [0, -half],
      [armMm, -half],
      [armMm, half],
      [0, half],
    ]);
    const opening = new Path();
    roundedRect(opening, windowMm, windowWideMm, 0.8, windowX);
    armShape.holes.push(opening);
    // Läppen är armens fortsättning, med rundade hörn längst ut.
    const corner = Math.min(3.5, half * 0.6, lipMm * 0.8);
    const lipShape = new Shape();
    lipShape.moveTo(0, -half);
    lipShape.lineTo(lipMm - corner, -half);
    lipShape.absarc(lipMm - corner, -half + corner, corner, -Math.PI / 2, 0, false);
    lipShape.lineTo(lipMm, half - corner);
    lipShape.absarc(lipMm - corner, half - corner, corner, 0, Math.PI / 2, false);
    lipShape.lineTo(0, half);
    lipShape.lineTo(0, -half);
    return {
      base: roundedRectShape(longMm, wideMm, cornerMm),
      fold: foldGeometry({ foldX, bend, reach: CLIP_FOLD_REACH_MM, sheet, width: armWideMm }),
      arm: armShape,
      lip: lipShape,
      tongue: roundedRectShape(tongueMm, windowWideMm * 0.56, 0.7, -tongueMm / 2),
    };
  }, [longMm, wideMm, cornerMm, armMm, armWideMm, foldX, windowMm, windowWideMm, windowX, tongueMm, lipMm]);
  useEffect(() => () => fold.dispose(), [fold]);
  return (
    <group position={[0, 0, 0.02]}>
      <mesh>
        <extrudeGeometry args={[base, slab(sheet)]} />
        <Steel tone="shade" />
      </mesh>
      <mesh geometry={fold}>
        <Steel />
      </mesh>
      <group position={[foldX, 0, armZ]} rotation={[0, tilt, 0]}>
        <mesh>
          <extrudeGeometry args={[arm, slab(sheet)]} />
          <Steel />
        </mesh>
        {/* Tungan sitter fast i fönstrets kant närmast läppen och pekar ner mot plattan. */}
        <group position={[tongueX, 0, 0]} rotation={[0, -tongueDrop, 0]}>
          <mesh>
            <extrudeGeometry args={[tongue, slab(sheet)]} />
            <Steel />
          </mesh>
        </group>
        <group position={[armMm, 0, 0]} rotation={[0, -0.6, 0]}>
          {/* Bocken mellan armen och läppen. */}
          <mesh position={[0, 0, sheet / 2]}>
            <cylinderGeometry args={[sheet / 2, sheet / 2, armWideMm, 12]} />
            <Steel />
          </mesh>
          <mesh>
            <extrudeGeometry args={[lip, slab(sheet)]} />
            <Steel />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/** Säkerhetsnålen säljs inte längre, men äldre ordrar ska gå att rita. */
function SafetyPin({ widthUnits: w }: { widthUnits: number }) {
  return (
    <group position={[0, 0, -1 * mm]}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.3 * mm, 0.3 * mm, w * 0.56, 10]} />
        <Steel />
      </mesh>
      <mesh position={[-w * 0.28, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[1.4 * mm, 0.3 * mm, 8, 24]} />
        <Steel />
      </mesh>
      <mesh position={[w * 0.28, 0, 0]}>
        <boxGeometry args={[4 * mm, 3 * mm, 1.6 * mm]} />
        <Steel />
      </mesh>
    </group>
  );
}
