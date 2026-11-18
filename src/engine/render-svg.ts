import { getColor, getFont, getMaterial } from "./catalog";
import { engravingPaths, printedPaths } from "./engraving";
import type { BadgeLayout, FontEngine } from "./layout";
import type { BadgeDocument, MaterialFinish } from "./types";

/**
 * - `preview`: det kunden ser i ritningsvyn och på startsidan.
 * - `production`: leverantörens filkonvention — röd = skär, svart = gravyr.
 *   Det som printas, namnet eller loggan, finns därför inte med i den filen.
 */
export type RenderMode = "preview" | "production";

export interface RenderOptions {
  mode: RenderMode;
  /** Med konturer ritas glyferna som paths — exakt det som graveras. */
  fonts?: FontEngine;
  /** Sätter `width`/`height` i px. Utelämnad = skalbar SVG. */
  pxPerMm?: number;
  showDimensions?: boolean;
  /** Rader som ritas som ljusgrå platshållare. Bara i preview. */
  placeholderRowIds?: ReadonlySet<string>;
  /** Unikt prefix för `<defs>`-id:n när flera SVG:er delar samma sida. */
  idPrefix?: string;
}

const PRODUCTION_CUT = "#FF0000";
const PRODUCTION_ENGRAVE = "#000000";
const PLACEHOLDER_FILL = "#B4B8BF";
const DIMENSION_INK = "#8A8F98";
const DIMENSION_PAD_MM = 9;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function num(value: number): string {
  return Number.isFinite(value) ? String(Number(value.toFixed(4))) : "0";
}

/** Hur ytan ritas: borstad metall, slät plast eller blank kupol. */
type SurfaceLook = "brushed" | "satin" | "gloss";

function surfaceLook(finish: MaterialFinish, color: { lacquered?: boolean; metallic?: boolean }): SurfaceLook {
  // Lackad metall är slät som plast. Guld- och silverplast har en borstad metallfilm överst.
  if (color.lacquered) return "satin";
  if (finish === "plastic") return color.metallic ? "brushed" : "satin";
  if (finish === "acrylic" || finish === "epoxy") return "gloss";
  return "brushed";
}

/** Ljus yta: där syns en reflex som en svag skugga, inte som vitt på vitt. */
function isLight(hex: string): boolean {
  const value = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1];
  if (!value) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.8;
}

type Stop = readonly [offset: number, tone: string, opacity: number];

function gradient(id: string, direction: string, stops: readonly Stop[]): string {
  const marks = stops.map(([offset, tone, opacity]) => `<stop offset="${offset}" stop-color="${tone}" stop-opacity="${num(opacity)}"/>`).join("");
  return `<linearGradient id="${id}" ${direction}>${marks}</linearGradient>`;
}

/**
 * Ytan i förhandsvisningen: skyltens färg med ljus, reflexer och en fasad kant ovanpå, så att
 * ritningen har samma känsla som 3D-vyn fast den står still (besked via ägaren 2026-11-18).
 * Allt ligger under texten och loggan, och inget av det finns i produktionsfilen.
 *
 * - Borstad metall: stråk av ljus tvärs över skylten och fina borstlinjer längs med.
 * - Slät plast och lack: mjukt ljus uppifrån och en sned reflex.
 * - Akryl och epoxy: samma, men blankare.
 */
function surfaceMarkup(look: SurfaceLook, surface: string, outline: string, id: string): string {
  const fill = (paint: string) => `<path d="${outline}" fill="url(#${id}-${paint})"/>`;
  const light = isLight(surface);
  // Kanten: ljus där ljuset kommer uppifrån, mörk i underkanten. Klipps till skyltens insida.
  const edge = gradient(`${id}-edge`, 'x1="0" y1="0" x2="0" y2="1"', [
    [0, "#fff", light ? 0.9 : 0.6],
    [0.45, "#fff", 0],
    [0.6, "#000", 0],
    [1, "#000", light ? 0.2 : 0.32],
  ]);
  const bevel = `<path d="${outline}" fill="none" stroke="url(#${id}-edge)" stroke-width=".9" clip-path="url(#${id}-clip)"/>`;
  const clip = `<clipPath id="${id}-clip"><path d="${outline}"/></clipPath>`;
  const base = `<path d="${outline}" fill="${surface}"/>`;

  if (look === "brushed") {
    const bands = gradient(`${id}-sheen`, 'x1="0" y1="0" x2="1" y2=".18"', [
      [0, "#000", 0.14],
      [0.12, "#fff", 0.1],
      [0.3, "#fff", 0.46],
      [0.42, "#fff", 0.1],
      [0.58, "#000", 0.1],
      [0.74, "#fff", 0.3],
      [0.88, "#fff", 0.05],
      [1, "#000", 0.1],
    ]);
    const shade = gradient(`${id}-shade`, 'x1="0" y1="0" x2="0" y2="1"', [
      [0, "#fff", 0.16],
      [0.45, "#fff", 0],
      [1, "#000", 0.14],
    ]);
    // Borstlinjerna är tunnare än en skärmpunkt i små bilder och syns där bara som en svag ton.
    const brush = `<pattern id="${id}-brush" width="12" height=".34" patternUnits="userSpaceOnUse"><rect width="12" height=".06" fill="#fff" fill-opacity=".16"/><rect y=".17" width="12" height=".05" fill="#000" fill-opacity=".07"/></pattern>`;
    return `<defs>${clip}${edge}${bands}${shade}${brush}</defs>${base}${fill("brush")}${fill("sheen")}${fill("shade")}${bevel}`;
  }

  const strength = look === "gloss" ? 1.8 : 1;
  const tone = light ? "#000" : "#fff";
  const reflex = (opacity: number) => Math.min(0.6, opacity * strength * (light ? 0.22 : 1));
  const shade = gradient(`${id}-sheen`, 'x1="0" y1="0" x2="0" y2="1"', [
    [0, "#fff", Math.min(0.5, 0.22 * strength)],
    [0.5, "#fff", 0],
    [1, "#000", 0.1],
  ]);
  const streak = gradient(`${id}-streak`, 'x1="0" y1="0" x2="1" y2=".55"', [
    [0.26, tone, 0],
    [0.36, tone, reflex(0.2)],
    [0.45, tone, 0],
    [0.52, tone, 0],
    [0.57, tone, reflex(0.09)],
    [0.62, tone, 0],
  ]);
  return `<defs>${clip}${edge}${shade}${streak}</defs>${base}${fill("sheen")}${fill("streak")}${bevel}`;
}

function dimensionMarks(widthMm: number, heightMm: number): string {
  const y = heightMm + 4.5;
  const x = widthMm + 4.5;
  const tick = 1.2;
  const style = `stroke="${DIMENSION_INK}" stroke-width=".18" fill="none"`;
  const text = `fill="${DIMENSION_INK}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="2.6"`;
  return [
    `<path d="M0 ${num(y)}H${num(widthMm)}M0 ${num(y - tick)}v${tick * 2}M${num(widthMm)} ${num(y - tick)}v${tick * 2}" ${style}/>`,
    `<text x="${num(widthMm / 2)}" y="${num(y + 3.6)}" text-anchor="middle" ${text}>${num(widthMm)} mm</text>`,
    `<path d="M${num(x)} 0V${num(heightMm)}M${num(x - tick)} 0h${tick * 2}M${num(x - tick)} ${num(heightMm)}h${tick * 2}" ${style}/>`,
    `<text x="${num(x + 1.6)}" y="${num(heightMm / 2 + 0.9)}" ${text}>${num(heightMm)}</text>`,
  ].join("");
}

/** Ritningens koordinatsystem i mm, så att ett överlägg kan läggas exakt ovanpå. */
export function previewViewBox(layout: BadgeLayout, showDimensions: boolean): string {
  const pad = showDimensions ? DIMENSION_PAD_MM : 0;
  return `0 0 ${num(layout.widthMm + pad)} ${num(layout.heightMm + pad)}`;
}

export function renderBadgeSvg(
  doc: BadgeDocument,
  layout: BadgeLayout,
  options: RenderOptions,
): string {
  const {
    mode,
    fonts,
    pxPerMm,
    showDimensions = false,
    placeholderRowIds,
    idPrefix = "badge",
  } = options;
  const { widthMm: w, heightMm: h } = layout;
  const material = getMaterial(doc.materialId);
  const color = getColor(doc.materialId, doc.colorId);
  const isPreview = mode === "preview";
  const pad = isPreview && showDimensions ? DIMENSION_PAD_MM : 0;
  const engraveFill = isPreview ? color.engraving : PRODUCTION_ENGRAVE;
  // Kundens hexfärg gäller bara trycket, som bara ritas i förhandsvisningen.
  const fillFor = (rowId: string | undefined, ink?: string) => {
    if (isPreview && rowId && placeholderRowIds?.has(rowId)) return PLACEHOLDER_FILL;
    return isPreview && ink ? ink : engraveFill;
  };

  const parts: string[] = [];

  if (isPreview) {
    parts.push(surfaceMarkup(surfaceLook(material.finish, color), color.surface, layout.outline, idPrefix));
  } else {
    parts.push(
      `<path d="${layout.outline}" fill="none" stroke="${PRODUCTION_CUT}" stroke-width=".1"/>`,
    );
  }

  // Trycket ligger på ytan, under gravyren.
  if (isPreview && layout.logo?.imageSrc) {
    const { x, y, width, height, imageSrc } = layout.logo;
    parts.push(
      `<image href="${escapeXml(imageSrc)}" x="${num(x)}" y="${num(y)}" width="${num(width)}" height="${num(height)}" preserveAspectRatio="none"/>`,
    );
  }

  // Ritningen visar allt som märks. Produktionsfilen har bara gravyren: det som printas går inte till fräsen.
  const drawName = isPreview || !layout.namePrinted;
  const drawLogo = isPreview || !layout.logo?.printed;
  const engraving = fonts ? engravingPaths(layout, fonts) : null;
  const printed = fonts && isPreview ? printedPaths(layout, fonts) : null;
  if (engraving) {
    // Printen ligger på ytan, under gravyren.
    for (const path of [...(printed ?? []), ...engraving]) {
      parts.push(`<path d="${path.d}" fill="${fillFor(path.rowId, path.ink)}" fill-rule="${path.fillRule}"/>`);
    }
  } else {
    const printFill = isPreview && layout.printInk ? layout.printInk : engraveFill;
    if (drawName) {
      for (const frame of layout.frames) {
        parts.push(`<path d="${frame.d}" fill="${layout.namePrinted ? printFill : engraveFill}" fill-rule="evenodd"/>`);
      }
    }
    if (layout.logo && !layout.logo.imageSrc && drawLogo) {
      parts.push(`<path d="${layout.logo.d}" fill="${fillFor(undefined, layout.logo.ink)}" fill-rule="evenodd"/>`);
    }
    const family = escapeXml(getFont(doc.font).css);
    for (const row of drawName ? layout.rows : []) {
      parts.push(
        `<text x="${num(row.xMm)}" y="${num(row.baselineMm)}" text-anchor="${row.anchor}" font-family="${family}" font-size="${num(row.fontSizeMm)}" font-weight="${row.bold ? 700 : 400}" fill="${fillFor(row.id, row.ink)}">${escapeXml(row.text)}</text>`,
      );
    }
  }

  if (isPreview) {
    parts.push(
      `<path d="${layout.outline}" fill="none" stroke="#0B0B0C" stroke-opacity=".18" stroke-width=".2"/>`,
    );
    if (showDimensions) parts.push(dimensionMarks(w, h));
  }

  const viewW = w + pad;
  const viewH = h + pad;
  const size = pxPerMm
    ? ` width="${Math.round(viewW * pxPerMm)}" height="${Math.round(viewH * pxPerMm)}"`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(viewW)} ${num(viewH)}"${size}>${parts.join("")}</svg>`;
}
