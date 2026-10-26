import { getColor, getFont, getMaterial } from "./catalog";
import type { BadgeLayout } from "./layout";
import type { BadgeDocument, MaterialFinish } from "./types";

/**
 * - `preview`: det kunden ser i ritningsvyn och på startsidan.
 * - `texture-*`: kartor till 3D-vyn. Fyller hela rektangeln — formen klipps
 *   av geometrin, så kanterna får inga halvgenomskinliga pixlar.
 * - `production`: leverantörens filkonvention — röd = skär, svart = gravyr.
 */
export type RenderMode =
  | "preview"
  | "production"
  | "texture-color"
  | "texture-bump"
  | "texture-roughness";

export interface RenderOptions {
  mode: RenderMode;
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

/** Gråvärden i roughness-kartan: blank yta vs. matt gravyrbotten. */
const ROUGHNESS_SURFACE: Record<MaterialFinish, string> = {
  plastic: "#5c5c5c",
  aluminium: "#6e6e6e",
  steel: "#5a5a5a",
};
const ROUGHNESS_ENGRAVED = "#e6e6e6";

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
  if (finish === "plastic") {
    return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".06"/></linearGradient>`;
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

export function renderBadgeSvg(
  doc: BadgeDocument,
  layout: BadgeLayout,
  options: RenderOptions,
): string {
  const { mode, pxPerMm, showDimensions = false, placeholderRowIds, idPrefix = "badge" } = options;
  const { widthMm: w, heightMm: h } = layout;
  const material = getMaterial(doc.materialId);
  const color = getColor(doc.materialId, doc.colorId);
  const font = getFont(doc.font);
  const isTexture = mode.startsWith("texture");
  const pad = mode === "preview" && showDimensions ? DIMENSION_PAD_MM : 0;

  const engraveFill =
    mode === "production"
      ? PRODUCTION_ENGRAVE
      : mode === "texture-bump"
        ? "#000"
        : mode === "texture-roughness"
          ? ROUGHNESS_ENGRAVED
          : color.engraving;

  const surfaceFill =
    mode === "texture-bump"
      ? "#fff"
      : mode === "texture-roughness"
        ? ROUGHNESS_SURFACE[material.finish]
        : color.surface;

  const gradientId = `${idPrefix}-sheen`;
  const parts: string[] = [];

  if (mode === "preview") {
    parts.push(`<defs>${surfaceDefs(material.finish, gradientId)}</defs>`);
    parts.push(`<path d="${layout.outline}" fill="${surfaceFill}"/>`);
    parts.push(`<path d="${layout.outline}" fill="url(#${gradientId})"/>`);
  } else if (mode === "production") {
    parts.push(
      `<path d="${layout.outline}" fill="none" stroke="${PRODUCTION_CUT}" stroke-width=".1"/>`,
    );
  } else {
    parts.push(`<rect width="${num(w)}" height="${num(h)}" fill="${surfaceFill}"/>`);
  }

  for (const frame of layout.frames) {
    parts.push(
      `<path d="${frame.d}" fill="none" stroke="${engraveFill}" stroke-width="${num(frame.strokeMm)}"/>`,
    );
  }

  const family = escapeXml(font.css);
  for (const row of layout.rows) {
    const isPlaceholder = mode === "preview" && placeholderRowIds?.has(row.id);
    parts.push(
      `<text x="${num(row.xMm)}" y="${num(row.baselineMm)}" text-anchor="${row.anchor}" font-family="${family}" font-size="${num(row.fontSizeMm)}" font-weight="${row.bold ? 700 : 400}" fill="${isPlaceholder ? PLACEHOLDER_FILL : engraveFill}">${escapeXml(row.text)}</text>`,
    );
  }

  if (mode === "preview") {
    parts.push(`<path d="${layout.outline}" fill="none" stroke="#0B0B0C" stroke-opacity=".12" stroke-width=".2"/>`);
    if (showDimensions) parts.push(dimensionMarks(w, h));
  }

  const viewW = w + pad;
  const viewH = h + pad;
  const size = pxPerMm
    ? ` width="${Math.round(viewW * pxPerMm)}" height="${Math.round(viewH * pxPerMm)}"`
    : "";
  const ratio = isTexture ? ` preserveAspectRatio="none"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(viewW)} ${num(viewH)}"${size}${ratio}>${parts.join("")}</svg>`;
}
