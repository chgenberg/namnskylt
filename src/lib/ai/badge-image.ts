import "server-only";
import { Resvg } from "@resvg/resvg-js";
import { layoutBadge, renderBadgeSvg, type BadgeDocument, type BadgeLogo } from "@/engine";
import { loadNodeFontEngine } from "@/lib/fonts/load-node";

/** Upplösning på referensbilden till bildmodellen — 70 mm blir ~1100 px. */
const REFERENCE_PX_PER_MM = 16;

/**
 * Skylten som PNG, renderad på servern ur det validerade dokumentet. Glyferna
 * är konturer, så resvg behöver inga systemtypsnitt.
 */
export async function renderBadgePng(doc: BadgeDocument): Promise<Buffer> {
  const fonts = await loadNodeFontEngine();
  const svg = renderBadgeSvg(doc, layoutBadge(doc, fonts), {
    mode: "preview",
    fonts,
    pxPerMm: REFERENCE_PX_PER_MM,
  });
  return new Resvg(svg).render().asPng();
}

/** Längsta sida på loggans miniatyr till leverantören. */
const LOGO_THUMBNAIL_PX = 512;

/** Loggan svart på vitt som PNG-data-URL — så som lasern ser den. */
export function renderLogoPng(logo: BadgeLogo): string {
  const scale = LOGO_THUMBNAIL_PX / Math.max(logo.viewWidth, logo.viewHeight);
  const width = Math.max(1, Math.round(logo.viewWidth * scale));
  const height = Math.max(1, Math.round(logo.viewHeight * scale));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${logo.viewWidth} ${logo.viewHeight}" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#fff"/><path d="${logo.d}" fill="#000" fill-rule="evenodd"/></svg>`;
  return `data:image/png;base64,${new Resvg(svg).render().asPng().toString("base64")}`;
}
