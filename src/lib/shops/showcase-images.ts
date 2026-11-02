import "server-only";
import sharp from "sharp";
import { createBadgeDocument, type BadgeDocument } from "@/engine";
import { renderBadgePng } from "@/lib/ai/badge-image";
import { saveImage, type ShopImage } from "./editor-repository";
import { SHOWCASE_MATERIALS } from "./page-templates";

const CANVAS = { width: 1600, height: 1200 };
const BADGE_WIDTH_PX = 1040;
const PAPER = "#ebe8e0";

/** Exemplet på skylten: ett vanligt namn och butikens namn som titel. */
function showcaseDoc(index: number, shopName: string): BadgeDocument {
  const material = SHOWCASE_MATERIALS[index % SHOWCASE_MATERIALS.length] ?? SHOWCASE_MATERIALS[0];
  const names = ["Anna Lindqvist", "Erik Holm", "Sara Nyberg", "Johan Ek"];
  const doc = createBadgeDocument([names[index % names.length] ?? "Anna Lindqvist", shopName.slice(0, 26)]);
  return { ...doc, materialId: material.materialId, colorId: material.colorId };
}

/** Skylten på papper med en mjuk skugga, som en produktbild. */
async function showcasePng(doc: BadgeDocument): Promise<{ bytes: Buffer; width: number; height: number }> {
  const badge = await sharp(await renderBadgePng(doc)).resize({ width: BADGE_WIDTH_PX }).png().toBuffer({ resolveWithObject: true });
  const { width, height } = badge.info;
  const left = Math.round((CANVAS.width - width) / 2);
  const top = Math.round((CANVAS.height - height) / 2) - 30;
  const shadow = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}"><defs><filter id="b"><feGaussianBlur stdDeviation="28"/></filter></defs><ellipse cx="${CANVAS.width / 2}" cy="${top + height + 46}" rx="${width * 0.44}" ry="34" fill="rgba(10,10,11,0.28)" filter="url(#b)"/></svg>`,
  );
  const bytes = await sharp({ create: { ...CANVAS, channels: 3, background: PAPER } })
    .composite([{ input: shadow }, { input: badge.data, left, top }])
    .webp({ quality: 84 })
    .toBuffer();
  return { bytes, ...CANVAS };
}

/** Ritar och sparar exempelbilderna en mall behöver. */
export async function createShowcaseImages(slug: string, shopName: string, count: number): Promise<ShopImage[]> {
  const images: ShopImage[] = [];
  for (let i = 0; i < count; i++) {
    const png = await showcasePng(showcaseDoc(i, shopName));
    images.push(await saveImage(slug, { mime: "image/webp", ...png }));
  }
  return images;
}
