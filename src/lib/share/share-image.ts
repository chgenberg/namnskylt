import "server-only";
import { Resvg } from "@resvg/resvg-js";
import { engravedRows, layoutBadge, renderBadgeSvg, type BadgeDocument, type FontEngine } from "@/engine";
import { loadNodeFontEngine } from "@/lib/fonts/load-node";
import { genitive } from "./genitive";

/** Länkförhandsvisningarnas standardformat (Open Graph). */
export const SHARE_IMAGE_WIDTH_PX = 1200;
export const SHARE_IMAGE_HEIGHT_PX = 630;

const BADGE_MAX_WIDTH_PX = 860;
const BADGE_MAX_HEIGHT_PX = 330;
const PAPER = "#f6f6f3";
const NAVY = "#0b1f3a";
const MUTED = "#6b7079";

function textPath(fonts: FontEngine, text: string, sizePx: number, bold: boolean, x: number, baseline: number) {
  return fonts.outline?.(text, { fontId: "arial", bold, sizeMm: sizePx }, x, baseline) ?? "";
}

function centeredText(fonts: FontEngine, text: string, sizePx: number, bold: boolean, baseline: number, fill: string) {
  const width = fonts.measure(text, { fontId: "arial", bold, sizeMm: sizePx });
  const d = textPath(fonts, text, sizePx, bold, (SHARE_IMAGE_WIDTH_PX - width) / 2, baseline);
  return d ? `<path d="${d}" fill="${fill}"/>` : "";
}

/** Skylten på papper med mjuk skugga och avsändare — samma ritning som kunden ser. */
export async function renderShareImage(doc: BadgeDocument): Promise<Buffer> {
  const fonts = await loadNodeFontEngine();
  const { widthMm, heightMm } = doc.size;
  const scale = Math.min(BADGE_MAX_WIDTH_PX / widthMm, BADGE_MAX_HEIGHT_PX / heightMm);
  const w = widthMm * scale;
  const h = heightMm * scale;
  const x = (SHARE_IMAGE_WIDTH_PX - w) / 2;
  const y = 120 + (BADGE_MAX_HEIGHT_PX - h) / 2;
  const badge = renderBadgeSvg(doc, layoutBadge(doc, fonts), { mode: "preview", fonts, idPrefix: "share" }).replace(
    "<svg ",
    `<svg x="${x}" y="${y}" width="${w}" height="${h}" `,
  );
  const name = engravedRows(doc)[0]?.text.trim();
  const heading = name ? `${genitive(name)} nya namnskylt` : "En ny namnskylt";

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHARE_IMAGE_WIDTH_PX}" height="${SHARE_IMAGE_HEIGHT_PX}" viewBox="0 0 ${SHARE_IMAGE_WIDTH_PX} ${SHARE_IMAGE_HEIGHT_PX}">`,
    `<defs>`,
    `<radialGradient id="glow" cx="50%" cy="45%" r="65%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="${PAPER}"/></radialGradient>`,
    `<pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="1" fill="#0b1f3a" fill-opacity=".08"/></pattern>`,
    `<filter id="shadow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="22"/></filter>`,
    `</defs>`,
    `<rect width="100%" height="100%" fill="url(#glow)"/>`,
    `<rect width="100%" height="100%" fill="url(#dots)"/>`,
    `<ellipse cx="${SHARE_IMAGE_WIDTH_PX / 2}" cy="${y + h + 26}" rx="${w * 0.46}" ry="18" fill="#0b1f3a" fill-opacity=".22" filter="url(#shadow)"/>`,
    badge,
    centeredText(fonts, heading.length > 48 ? "En ny namnskylt" : heading, 38, true, 76, NAVY),
    centeredText(fonts, "Graverad i Sverige · namnskylt.com", 24, false, 580, MUTED),
    `</svg>`,
  ].join("");
  return new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();
}
