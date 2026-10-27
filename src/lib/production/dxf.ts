import { flattenPath, type Pt } from "./flatten-path";
import { DXF_LAYERS } from "./ink";
import type { MarkInk, SheetMark } from "./sheet-geometry";

/**
 * Arket som DXF (AutoCAD R12 ASCII), samma kontrakt som verkstadens
 * `signToDxf`: CUT (1, röd) = skär, ENGRAVE (7) = gravyr, DRILL (5, blå) =
 * genomskär. Allt som LINE-segment för bredast CAM-kompatibilitet. DXF har y
 * uppåt, så y speglas mot arkets höjd.
 */

const LAYER_FOR: Record<MarkInk, (typeof DXF_LAYERS)[keyof typeof DXF_LAYERS]> = {
  cut: DXF_LAYERS.cut,
  throughCut: DXF_LAYERS.drill,
  engrave: DXF_LAYERS.engrave,
};

function g(code: number, value: string | number): string {
  return `${code}\n${value}\n`;
}

function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

function line(a: Pt, b: Pt, layer: { name: string; color: number }): string {
  return (
    g(0, "LINE") +
    g(8, layer.name) +
    g(62, layer.color) +
    g(10, fmt(a.x)) +
    g(20, fmt(a.y)) +
    g(11, fmt(b.x)) +
    g(21, fmt(b.y))
  );
}

function layerDef(layer: { name: string; color: number }): string {
  return g(0, "LAYER") + g(2, layer.name) + g(70, 0) + g(62, layer.color) + g(6, "CONTINUOUS");
}

export function sheetToDxf(marks: readonly SheetMark[], sheetHeightMm: number): string {
  const entities: string[] = [];
  for (const mark of marks) {
    const layer = LAYER_FOR[mark.ink];
    const map = (p: Pt): Pt => ({ x: p.x + mark.dx, y: sheetHeightMm - (p.y + mark.dy) });
    for (const polyline of flattenPath(mark.d)) {
      const points = polyline.points.map(map);
      for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1];
        const b = points[i];
        if (a && b && (a.x !== b.x || a.y !== b.y)) entities.push(line(a, b, layer));
      }
    }
  }

  const layers = Object.values(DXF_LAYERS);
  return (
    g(0, "SECTION") +
    g(2, "HEADER") +
    g(9, "$ACADVER") +
    g(1, "AC1009") +
    g(9, "$INSUNITS") +
    g(70, 4) +
    g(0, "ENDSEC") +
    g(0, "SECTION") +
    g(2, "TABLES") +
    g(0, "TABLE") +
    g(2, "LAYER") +
    g(70, layers.length) +
    layers.map(layerDef).join("") +
    g(0, "ENDTAB") +
    g(0, "ENDSEC") +
    g(0, "SECTION") +
    g(2, "ENTITIES") +
    entities.join("") +
    g(0, "ENDSEC") +
    g(0, "EOF")
  );
}
