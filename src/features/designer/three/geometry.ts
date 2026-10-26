import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Material, Shape } from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  effectiveCornerRadius,
  getMaterial,
  type BadgeDocument,
  type EngravedPath,
} from "@/engine";

/** Scenenheter per mm. Fast skala så att storleksbyten syns i 3D. */
export const UNITS_PER_MM = 0.034;
/** Riktiga skyltar är 0,8–1 mm; något tjockare i vyn så kanten läses. */
const MIN_VISUAL_THICKNESS_MM = 1.6;
const BEVEL_MM = 0.35;
const CURVE_SEGMENTS = 64;
const GLYPH_CURVE_SEGMENTS = 6;
/** Fräsdjup i vyn — överdrivet mot verkligheten (≈0,1 mm) så att ljuset fångar kanten. */
const ENGRAVE_DEPTH_MM = { plastic: 0.35, aluminium: 0.25, steel: 0.2 } as const;
/** Fräsen sticker upp över ytan så att subtraktionen aldrig lämnar en hinna. */
const CUTTER_OVERSHOOT_MM = 0.5;

/** Materialplatser: grupper under bygget, index i `BadgeGeometry` efteråt. */
export const SURFACE_SLOT = 0;
export const CORE_SLOT = 1;
export const ENGRAVING_SLOT = 2;

/** Ytskikt, kärna och gravyr — i den ordningen. */
export type BadgeGeometry = [surface: BufferGeometry, core: BufferGeometry, engraving: BufferGeometry];

export interface PlateMetrics {
  widthUnits: number;
  heightUnits: number;
  /** Framsidans z — där gravyren börjar. */
  frontZ: number;
  backZ: number;
}

export function plateMetrics(doc: BadgeDocument): PlateMetrics {
  const depth = Math.max(getMaterial(doc.materialId).thicknessMm, MIN_VISUAL_THICKNESS_MM);
  const half = (depth / 2 + BEVEL_MM) * UNITS_PER_MM;
  return {
    widthUnits: doc.size.widthMm * UNITS_PER_MM,
    heightUnits: doc.size.heightMm * UNITS_PER_MM,
    frontZ: half,
    backZ: -half,
  };
}

function outlineShape(doc: BadgeDocument): Shape {
  const w = doc.size.widthMm * UNITS_PER_MM;
  const h = doc.size.heightMm * UNITS_PER_MM;
  const shape = new Shape();

  if (doc.shape === "oval") {
    shape.absellipse(0, 0, w / 2, h / 2, 0, Math.PI * 2, false, 0);
    return shape;
  }

  const r = effectiveCornerRadius(doc) * UNITS_PER_MM;
  const x = -w / 2;
  const y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  if (r > 0) shape.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(x + w, y + h - r);
  if (r > 0) shape.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  shape.lineTo(x + r, y + h);
  if (r > 0) shape.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(x, y + r);
  if (r > 0) shape.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return shape;
}

const ATTRIBUTES = ["position", "normal", "uv"] as const;

type SlotOf = (triangle: number, group: number) => number;

/** Trianglarna per materialplats, i en icke-indexerad kopia av geometrin. */
function partition(geometry: BufferGeometry, slotOf: SlotOf) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const buckets = new Map<number, number[]>();
  for (const group of geometry.groups) {
    for (let v = group.start; v < group.start + group.count; v += 3) {
      const slot = slotOf(v / 3, group.materialIndex ?? 0);
      const list = buckets.get(slot) ?? [];
      list.push(v / 3);
      buckets.set(slot, list);
    }
  }
  return {
    buckets,
    release: () => source !== geometry && source.dispose(),
    attribute: (name: (typeof ATTRIBUTES)[number]) => source.getAttribute(name),
  };
}

function assemble(
  { attribute }: ReturnType<typeof partition>,
  triangleLists: readonly (readonly number[])[],
): BufferGeometry {
  const result = new BufferGeometry();
  for (const name of ATTRIBUTES) {
    const source = attribute(name);
    const size = source.itemSize;
    const data: number[] = [];
    for (const triangles of triangleLists) {
      for (const triangle of triangles) {
        for (let k = 0; k < 3 * size; k++) data.push(source.array[triangle * 3 * size + k]!);
      }
    }
    result.setAttribute(name, new Float32BufferAttribute(data, size));
  }
  return result;
}

/**
 * Sorterar om trianglarna till materialgrupper. ExtrudeGeometry lägger fram-
 * och baksida i samma grupp; vi vill ha framsidan (ytskiktet) för sig och
 * resten (kärnan) för sig.
 */
function regroup(geometry: BufferGeometry, slotOf: SlotOf): BufferGeometry {
  const parts = partition(geometry, slotOf);
  const slots = [...parts.buckets.keys()].sort((a, b) => a - b);
  const lists = slots.map((slot) => parts.buckets.get(slot)!);
  const result = assemble(parts, lists);

  let start = 0;
  slots.forEach((slot, i) => {
    result.addGroup(start, lists[i]!.length * 3, slot);
    start += lists[i]!.length * 3;
  });
  parts.release();
  return result;
}

/**
 * En geometri per materialplats. Strålspåraren klarar inte flera material
 * på samma mesh, så skylten ritas som tre meshar.
 */
function splitBySlot(geometry: BufferGeometry): BadgeGeometry {
  const parts = partition(geometry, (_, group) => group);
  const slot = (index: number) => assemble(parts, [parts.buckets.get(index) ?? []]);
  const result: BadgeGeometry = [slot(SURFACE_SLOT), slot(CORE_SLOT), slot(ENGRAVING_SLOT)];
  parts.release();
  return result;
}

function plateGeometry(doc: BadgeDocument): BufferGeometry {
  const { frontZ } = plateMetrics(doc);
  const bevel = BEVEL_MM * UNITS_PER_MM;
  const depth = 2 * frontZ - 2 * bevel;
  const extruded = new ExtrudeGeometry(outlineShape(doc), {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    // Avfasningen läggs innanför konturen så att skylten håller exakt mått.
    bevelOffset: -bevel,
    bevelSegments: 4,
    curveSegments: CURVE_SEGMENTS,
  });
  extruded.translate(0, 0, -depth / 2);

  const position = extruded.getAttribute("position");
  const plate = regroup(extruded, (triangle, group) =>
    group === 0 && position.getZ(triangle * 3) > 0 ? SURFACE_SLOT : CORE_SLOT,
  );
  extruded.dispose();
  return plate;
}

/** Konturerna (mm, y nedåt) som former i scenens koordinater. */
function shapesFrom(doc: BadgeDocument, paths: readonly EngravedPath[]): Shape[] {
  if (paths.length === 0) return [];
  const u = UNITS_PER_MM;
  const { widthMm: w, heightMm: h } = doc.size;
  const body = paths.map((p) => `<path d="${p.d}" fill-rule="${p.fillRule}"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><g transform="matrix(${u} 0 0 ${-u} ${(-w / 2) * u} ${(h / 2) * u})">${body}</g></svg>`;
  return new SVGLoader().parse(svg).paths.flatMap((path) => path.toShapes());
}

/**
 * Gravyren som extruderad fräs. Ramarna är långa bågar och får samma
 * upplösning som skyltens kant; glyferna har korta kurvor och klarar sig
 * med färre segment.
 */
function cutterGeometry(doc: BadgeDocument, engraving: readonly EngravedPath[]): BufferGeometry | null {
  const depth = ENGRAVE_DEPTH_MM[getMaterial(doc.materialId).finish] * UNITS_PER_MM;
  const extrude = (shapes: Shape[], curveSegments: number) =>
    shapes.length === 0
      ? null
      : new ExtrudeGeometry(shapes, {
          depth: depth + CUTTER_OVERSHOOT_MM * UNITS_PER_MM,
          bevelEnabled: false,
          curveSegments,
        });

  const parts = [
    extrude(shapesFrom(doc, engraving.filter((p) => !p.rowId)), CURVE_SEGMENTS),
    extrude(shapesFrom(doc, engraving.filter((p) => p.rowId)), GLYPH_CURVE_SEGMENTS),
  ].filter((part): part is ExtrudeGeometry => part !== null);
  if (parts.length === 0) return null;

  const cutter = parts.length === 1 ? parts[0]! : mergeGeometries(parts);
  if (cutter !== parts[0]) parts.forEach((part) => part.dispose());
  cutter.clearGroups();
  cutter.translate(0, 0, plateMetrics(doc).frontZ - depth);
  return cutter;
}

const ROLE = {
  surface: new Material(),
  core: new Material(),
  engraving: new Material(),
};

const SLOT_BY_ROLE = new Map<Material, number>([
  [ROLE.surface, SURFACE_SLOT],
  [ROLE.core, CORE_SLOT],
  [ROLE.engraving, ENGRAVING_SLOT],
]);

/**
 * Skylten som solid med gravyren fräst ur ytan: glyfkonturerna extruderas
 * och subtraheras från plattan (CSG). Fickans väggar och botten får
 * gravyrmaterialet — i tvålagersplast är det kärnan som friläggs.
 */
export function buildBadgeGeometry(
  doc: BadgeDocument,
  engraving: readonly EngravedPath[] | null,
): BadgeGeometry {
  const plate = plateGeometry(doc);
  const cutter = engraving && engraving.length > 0 ? cutterGeometry(doc, engraving) : null;
  if (!cutter) {
    const parts = splitBySlot(plate);
    plate.dispose();
    return parts;
  }

  const evaluator = new Evaluator();
  evaluator.attributes = ["position", "normal", "uv"];
  evaluator.useGroups = true;

  const plateBrush = new Brush(plate, [ROLE.surface, ROLE.core]);
  const cutterBrush = new Brush(cutter, ROLE.engraving);
  plateBrush.updateMatrixWorld();
  cutterBrush.updateMatrixWorld();

  const result = evaluator.evaluate(plateBrush, cutterBrush, SUBTRACTION);
  const materials = (Array.isArray(result.material) ? result.material : [result.material]) as Material[];
  for (const group of result.geometry.groups) {
    const role = materials[group.materialIndex ?? 0];
    group.materialIndex = (role && SLOT_BY_ROLE.get(role)) ?? CORE_SLOT;
  }

  plateBrush.disposeCacheData();
  cutterBrush.disposeCacheData();
  plate.dispose();
  cutter.dispose();
  const parts = splitBySlot(result.geometry);
  result.geometry.dispose();
  return parts;
}
