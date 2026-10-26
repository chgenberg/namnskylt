import "server-only";
import { Resvg } from "@resvg/resvg-js";
import { layoutBadge, renderBadgeSvg, type BadgeDocument } from "@/engine";
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
