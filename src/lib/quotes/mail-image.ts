import "server-only";
import { Resvg } from "@resvg/resvg-js";
import { layoutBadge, renderBadgeSvg, type BadgeDocument } from "@/engine";
import { loadNodeFontEngine } from "@/lib/fonts/load-node";
import { withInlineLogoImages } from "@/lib/logo-images/repository";
import { QUOTE_PICTURE } from "./quote-email";

/** Filen är dubbelt så stor som bilden visas, så att den är skarp på en telefon. */
const SCALE = 2;
const WIDTH_PX = QUOTE_PICTURE.width * SCALE;
const HEIGHT_PX = QUOTE_PICTURE.height * SCALE;
/** Skylten får ta så här mycket av bilden i offertmejlet. Resten är luft och skugga. */
const DEFAULT_FILL = { width: 0.62, height: 0.6 };
const PAPER = "#f4f2ec";

/**
 * Skylten på papper med mjuk skugga, som bild till offertmejlet. Samma ritning
 * som kunden ser på offerten. E-postklienter visar varken SVG eller data-URL:er,
 * så bilden ritas till PNG och hämtas från offertens egen adress.
 */
export async function renderMailBadge(
  source: BadgeDocument,
  /** Hur mycket av bilden skylten får ta. Orderbekräftelsens små bilder ramar in skylten tätare. */
  fill: { width: number; height: number } = DEFAULT_FILL,
): Promise<Buffer> {
  const fonts = await loadNodeFontEngine();
  // resvg hämtar inga adresser: en logga i färg som ligger på servern läggs in i skylten först.
  const [doc = source] = await withInlineLogoImages([source]);
  const { widthMm, heightMm } = doc.size;
  const scale = Math.min((WIDTH_PX * fill.width) / widthMm, (HEIGHT_PX * fill.height) / heightMm);
  const w = widthMm * scale;
  const h = heightMm * scale;
  const x = (WIDTH_PX - w) / 2;
  const y = (HEIGHT_PX - h) / 2 - 10;
  const badge = renderBadgeSvg(doc, layoutBadge(doc, fonts), { mode: "preview", fonts, idPrefix: "mejl" }).replace(
    "<svg ",
    `<svg x="${x}" y="${y}" width="${w}" height="${h}" `,
  );
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH_PX}" height="${HEIGHT_PX}" viewBox="0 0 ${WIDTH_PX} ${HEIGHT_PX}">`,
    `<defs>`,
    `<radialGradient id="glow" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="#fbfaf6"/><stop offset="1" stop-color="${PAPER}"/></radialGradient>`,
    `<filter id="shadow" x="-30%" y="-150%" width="160%" height="400%"><feGaussianBlur stdDeviation="20"/></filter>`,
    `</defs>`,
    `<rect width="100%" height="100%" fill="url(#glow)"/>`,
    `<ellipse cx="${WIDTH_PX / 2}" cy="${y + h + 30}" rx="${w * 0.46}" ry="16" fill="#0a0a0b" fill-opacity=".2" filter="url(#shadow)"/>`,
    badge,
    `</svg>`,
  ].join("");
  return new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();
}
