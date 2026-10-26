import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Material, Shape, ShapePath } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  effectiveCornerRadius,
  frameBands,
  getMaterial,
  type BadgeDocument,
  type BadgeShape,
  type EngravedPath,
} from "@/engine";

/** Scenenheter per mm. Fast skala så att storleksbyten syns i 3D. */
export const UNITS_PER_MM = 0.034;
/** Riktiga skyltar är 0,8–1 mm; något tjockare i vyn så kanten läses. */
const MIN_VISUAL_THICKNESS_MM = 1.6;
const BEVEL_MM = 0.35;
/** Segment per båge: ovalen är en enda ellips, rundade hörn är fyra kvartsbågar. */
const OUTLINE_CURVE_SEGMENTS: Record<BadgeShape, number> = { oval: 128, rounded: 12, rectangle: 1 };
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

/** Skyltens kontur indragen `insetMm`, centrerad — samma form som `outlinePath`. */
function outlineShape(doc: BadgeDocument, insetMm = 0): Shape | null {
  const widthMm = doc.size.widthMm - insetMm * 2;
  const heightMm = doc.size.heightMm - insetMm * 2;
  if (widthMm <= 0 || heightMm <= 0) return null;
  const w = widthMm * UNITS_PER_MM;
  const h = heightMm * UNITS_PER_MM;
  const shape = new Shape();

  if (doc.shape === "oval") {
    shape.absellipse(0, 0, w / 2, h / 2, 0, Math.PI * 2, false, 0);
    return shape;
  }

  const rMm = Math.max(0, Math.min(effectiveCornerRadius(doc) - insetMm, widthMm / 2, heightMm / 2));
  const r = rMm * UNITS_PER_MM;
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

/** Längsta kant på framsidans trianglar innan fräsningen. */
const SURFACE_MAX_EDGE_MM = 2;

type Vertex = { position: number[]; normal: number[]; uv: number[] };

function lerpVertex(a: Vertex, b: Vertex): Vertex {
  const mid = (p: number[], q: number[]) => p.map((value, k) => (value + q[k]!) / 2);
  return { position: mid(a.position, b.position), normal: mid(a.normal, b.normal), uv: mid(a.uv, b.uv) };
}

function edgeLength(a: Vertex, b: Vertex): number {
  return Math.hypot(...a.position.map((value, k) => value - b.position[k]!));
}

/**
 * Delar framsidans trianglar tills ingen kant är längre än `maxEdge`. CSG:n
 * delar varje triangel mot alla fräsytor som korsar den; en stor triangel
 * som korsas av tusentals glyfkanter tar sekunder, många små tar en bråkdel.
 */
function refineSurface(plate: BufferGeometry, maxEdge: number): BufferGeometry {
  const read = (name: (typeof ATTRIBUTES)[number], vertex: number) => {
    const attribute = plate.getAttribute(name);
    return Array.from({ length: attribute.itemSize }, (_, k) => attribute.array[vertex * attribute.itemSize + k]!);
  };
  const vertex = (index: number): Vertex => ({
    position: read("position", index),
    normal: read("normal", index),
    uv: read("uv", index),
  });

  const slots = new Map<number, Vertex[][]>();
  for (const group of plate.groups) {
    const triangles = slots.get(group.materialIndex ?? 0) ?? [];
    for (let v = group.start; v < group.start + group.count; v += 3) {
      triangles.push([vertex(v), vertex(v + 1), vertex(v + 2)]);
    }
    slots.set(group.materialIndex ?? 0, triangles);
  }

  const split = (triangle: Vertex[], out: Vertex[][]) => {
    const edges = [0, 1, 2].map((k) => edgeLength(triangle[k]!, triangle[(k + 1) % 3]!));
    const longest = edges.indexOf(Math.max(...edges));
    if (edges[longest]! <= maxEdge) {
      out.push(triangle);
      return;
    }
    const a = triangle[longest]!;
    const b = triangle[(longest + 1) % 3]!;
    const c = triangle[(longest + 2) % 3]!;
    const m = lerpVertex(a, b);
    split([a, m, c], out);
    split([m, b, c], out);
  };

  const result = new BufferGeometry();
  const ordered = [...slots.keys()].sort((x, y) => x - y).map((slot) => {
    const source = slots.get(slot) ?? [];
    if (slot !== SURFACE_SLOT) return { slot, triangles: source };
    const refined: Vertex[][] = [];
    source.forEach((triangle) => split(triangle, refined));
    return { slot, triangles: refined };
  });
  for (const name of ATTRIBUTES) {
    const data = ordered.flatMap(({ triangles }) => triangles.flatMap((t) => t.flatMap((v) => v[name])));
    result.setAttribute(name, new Float32BufferAttribute(data, plate.getAttribute(name).itemSize));
  }
  let start = 0;
  for (const { slot, triangles } of ordered) {
    result.addGroup(start, triangles.length * 3, slot);
    start += triangles.length * 3;
  }
  return result;
}

function plateGeometry(doc: BadgeDocument): BufferGeometry {
  const { frontZ } = plateMetrics(doc);
  const bevel = BEVEL_MM * UNITS_PER_MM;
  const depth = 2 * frontZ - 2 * bevel;
  const outline = outlineShape(doc);
  if (!outline) throw new Error("Skylten saknar yta");
  const extruded = new ExtrudeGeometry(outline, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    // Avfasningen läggs innanför konturen så att skylten håller exakt mått.
    bevelOffset: -bevel,
    bevelSegments: 4,
    curveSegments: OUTLINE_CURVE_SEGMENTS[doc.shape],
  });
  extruded.translate(0, 0, -depth / 2);

  const position = extruded.getAttribute("position");
  const plate = regroup(extruded, (triangle, group) =>
    group === 0 && position.getZ(triangle * 3) > 0 ? SURFACE_SLOT : CORE_SLOT,
  );
  extruded.dispose();
  return plate;
}

/** Ramarna som ringar: konturen indragen, med nästa kontur inåt som hål. */
function frameShapes(doc: BadgeDocument): Shape[] {
  return frameBands(doc).flatMap(({ insetMm, thicknessMm }) => {
    const outer = outlineShape(doc, insetMm);
    if (!outer) return [];
    const inner = outlineShape(doc, insetMm + thicknessMm);
    if (inner) outer.holes.push(inner);
    return [outer];
  });
}

const PATH_TOKEN = /[MLQCZ]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

/**
 * Glyfkonturerna (mm, y nedåt) som former i scenens koordinater. Fontmotorn
 * skriver bara absoluta M/L/Q/C/Z, så en egen tolk räcker — och den kräver
 * ingen DOM, så geometrin kan byggas i en worker.
 */
function glyphShapes(doc: BadgeDocument, paths: readonly EngravedPath[]): Shape[] {
  const halfW = doc.size.widthMm / 2;
  const halfH = doc.size.heightMm / 2;
  return paths.flatMap((path) => {
    const tokens = path.d.match(PATH_TOKEN) ?? [];
    let i = 0;
    const x = () => (Number(tokens[i++]) - halfW) * UNITS_PER_MM;
    const y = () => (halfH - Number(tokens[i++])) * UNITS_PER_MM;
    const shapePath = new ShapePath();
    shapePath.userData = { style: { fillRule: path.fillRule } };
    while (i < tokens.length) {
      const command = tokens[i++];
      if (command === "M") shapePath.moveTo(x(), y());
      else if (command === "L") shapePath.lineTo(x(), y());
      else if (command === "Q") shapePath.quadraticCurveTo(x(), y(), x(), y());
      else if (command === "C") shapePath.bezierCurveTo(x(), y(), x(), y(), x(), y());
      else if (command === "Z" && shapePath.currentPath) shapePath.currentPath.autoClose = true;
      else throw new Error(`Okänt path-kommando i gravyren: ${command}`);
    }
    return shapePath.toShapes();
  });
}

/**
 * Gravyrens konturer extruderade `depthMm` uppåt från z = 0. Ramarna är
 * långa bågar och får samma upplösning som skyltens kant; glyferna har
 * korta kurvor och klarar sig med färre segment.
 */
function engravingSolid(doc: BadgeDocument, engraving: readonly EngravedPath[], depthMm: number) {
  const extrude = (shapes: Shape[], curveSegments: number) =>
    shapes.length === 0
      ? null
      : new ExtrudeGeometry(shapes, { depth: depthMm * UNITS_PER_MM, bevelEnabled: false, curveSegments });

  const parts = [
    extrude(frameShapes(doc), OUTLINE_CURVE_SEGMENTS[doc.shape]),
    extrude(glyphShapes(doc, engraving.filter((p) => p.rowId)), GLYPH_CURVE_SEGMENTS),
  ].filter((part): part is ExtrudeGeometry => part !== null);
  if (parts.length === 0) return null;

  const solid = parts.length === 1 ? parts[0]! : mergeGeometries(parts);
  if (solid !== parts[0]) parts.forEach((part) => part.dispose());
  solid.clearGroups();
  return solid;
}

/** Gravyren som fräs: når ned till fräsdjupet och sticker upp över ytan. */
function cutterGeometry(doc: BadgeDocument, engraving: readonly EngravedPath[]): BufferGeometry | null {
  const depthMm = ENGRAVE_DEPTH_MM[getMaterial(doc.materialId).finish];
  const cutter = engravingSolid(doc, engraving, depthMm + CUTTER_OVERSHOOT_MM);
  cutter?.translate(0, 0, plateMetrics(doc).frontZ - depthMm * UNITS_PER_MM);
  return cutter;
}

/** Förhandsgravyrens tjocklek ovanpå ytan — tunn nog att läsas som fräst rakt framifrån. */
const PREVIEW_LAYER_MM = 0.05;

/**
 * Snabb skylt utan CSG: gravyren ligger som ett tunt skikt på ytan i
 * stället för att fräsas ur den. Visas medan den riktiga byggs.
 */
export function buildPreviewGeometry(
  doc: BadgeDocument,
  engraving: readonly EngravedPath[] | null,
): BadgeGeometry {
  const plate = plateGeometry(doc);
  const [surface, core, empty] = splitBySlot(plate);
  plate.dispose();
  const layer = engraving && engraving.length > 0 ? engravingSolid(doc, engraving, PREVIEW_LAYER_MM) : null;
  if (!layer) return [surface, core, empty];
  empty.dispose();
  layer.translate(0, 0, plateMetrics(doc).frontZ - (PREVIEW_LAYER_MM / 2) * UNITS_PER_MM);
  return [surface, core, layer];
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

  const refined = refineSurface(plate, SURFACE_MAX_EDGE_MM * UNITS_PER_MM);
  plate.dispose();
  const plateBrush = new Brush(refined, [ROLE.surface, ROLE.core]);
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
  refined.dispose();
  cutter.dispose();
  const parts = splitBySlot(result.geometry);
  result.geometry.dispose();
  return parts;
}
