import { getColor, getFont, getMaterial } from "./catalog";
import { engravingPaths } from "./engraving";
import type { BadgeLayout, FontEngine } from "./layout";
import type { BadgeDocument, MaterialFinish } from "./types";

/**
 * - `preview`: det kunden ser i ritningsvyn och på startsidan.
 * - `production`: leverantörens filkonvention — röd = skär, svart = gravyr.
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

function surfaceDefs(finish: MaterialFinish, id: string): string {
  if (finish === "plastic" || finish === "acrylic" || finish === "epoxy") {
    // Akryl och epoxykupol är blanka: starkare ljusreflex i överkanten.
    const shine = finish === "plastic" ? ".18" : ".42";
    return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${shine}"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".08"/></linearGradient>`;
  }
  const stops = [0, 0.18, 0.34, 0.5, 0.66, 0.82, 1]
    .map((o, i) => {
      const opacity = i % 2 === 0 ? 0.22 : 0;
      return `<stop offset="${o}" stop-color="#fff" stop-opacity="${opacity}"/>`;
    })
    .join("");
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2=".2">${stops}</linearGradient>`;
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
  const fillFor = (rowId: string | undefined) =>
    isPreview && rowId && placeholderRowIds?.has(rowId) ? PLACEHOLDER_FILL : engraveFill;

  const gradientId = `${idPrefix}-sheen`;
  const parts: string[] = [];

  if (isPreview) {
    parts.push(`<defs>${surfaceDefs(material.finish, gradientId)}</defs>`);
    parts.push(`<path d="${layout.outline}" fill="${color.surface}"/>`);
    parts.push(`<path d="${layout.outline}" fill="url(#${gradientId})"/>`);
  } else {
    parts.push(
      `<path d="${layout.outline}" fill="none" stroke="${PRODUCTION_CUT}" stroke-width=".1"/>`,
    );
  }

  const engraving = fonts ? engravingPaths(layout, fonts) : null;
  if (engraving) {
    for (const path of engraving) {
      parts.push(`<path d="${path.d}" fill="${fillFor(path.rowId)}" fill-rule="${path.fillRule}"/>`);
    }
  } else {
    for (const frame of layout.frames) {
      parts.push(`<path d="${frame.d}" fill="${engraveFill}" fill-rule="evenodd"/>`);
    }
    if (layout.logo) {
      parts.push(`<path d="${layout.logo.d}" fill="${engraveFill}" fill-rule="evenodd"/>`);
    }
    const family = escapeXml(getFont(doc.font).css);
    for (const row of layout.rows) {
      parts.push(
        `<text x="${num(row.xMm)}" y="${num(row.baselineMm)}" text-anchor="${row.anchor}" font-family="${family}" font-size="${num(row.fontSizeMm)}" font-weight="${row.bold ? 700 : 400}" fill="${fillFor(row.id)}">${escapeXml(row.text)}</text>`,
      );
    }
  }

  if (isPreview) {
    parts.push(
      `<path d="${layout.outline}" fill="none" stroke="#0B0B0C" stroke-opacity=".12" stroke-width=".2"/>`,
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
