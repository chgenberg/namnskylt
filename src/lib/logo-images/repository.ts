import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { logoImageRef, type BadgeDocument } from "@/engine";
import { db } from "@/lib/db/client";
import { embeddedLogoImages, pngBytes, pngDataUrl, referencedLogoImages, replaceLogoImages } from "./model";
import { insertLogoImage, selectLogoImages } from "./store";

/** Designern gör bilden högst 640 px; allt större är inte en logga därifrån. */
const MAX_SIDE_PX = 1024;

export const MISSING_LOGO_IMAGE_ERROR = "Loggans bild finns inte kvar. Ladda upp loggan igen.";

/** Sant när bytesen verkligen är en PNG av rimlig storlek — det enda som får sparas och delas ut. */
async function isLogoPng(bytes: Buffer): Promise<boolean> {
  try {
    const { format, width = 0, height = 0 } = await sharp(bytes, { limitInputPixels: MAX_SIDE_PX * MAX_SIDE_PX }).metadata();
    return format === "png" && width > 0 && height > 0 && width <= MAX_SIDE_PX && height <= MAX_SIDE_PX;
  } catch {
    return false;
  }
}

/**
 * Sparar en logga i färg och ger adressen som skylten ska peka på. Id:t är
 * bildens SHA-256, så samma logga sparas en enda gång. `null` när bilden inte
 * är en giltig PNG eller databasen saknas — då får bilden ligga kvar i skylten.
 */
export async function storeLogoImage(dataUrl: string): Promise<string | null> {
  const sql = db();
  const bytes = pngBytes(dataUrl);
  if (!sql || !bytes || !(await isLogoPng(bytes))) return null;
  const id = createHash("sha256").update(bytes).digest("hex");
  await insertLogoImage(sql, id, bytes);
  return logoImageRef(id);
}

/** Bilden som delas ut på sin adress. */
export async function getLogoImage(id: string): Promise<Buffer | null> {
  const sql = db();
  return sql ? ((await selectLogoImages(sql, [id])).get(id) ?? null) : null;
}

/**
 * Skyltarna så som de ska sparas: en bild som ligger i en skylt flyttas till
 * servern och skylten pekar på den, så att en order med hundra namn sparar
 * loggan en gång. En bild som inte går att spara ligger kvar i skylten.
 */
export async function withStoredLogoImages(badges: readonly BadgeDocument[]): Promise<BadgeDocument[]> {
  const stored = new Map<string, string>();
  for (const src of embeddedLogoImages(badges)) {
    const ref = await storeLogoImage(src);
    if (ref) stored.set(src, ref);
  }
  return replaceLogoImages(badges, (src) => stored.get(src));
}

/**
 * Skyltarna så som de ska ritas utanför webbläsaren eller skickas vidare: en
 * bild som pekas ut på servern läggs in i skylten igen. En bild som saknas
 * lämnas som den är; `missingLogoImages` säger om det gäller någon.
 */
export async function withInlineLogoImages(badges: readonly BadgeDocument[]): Promise<BadgeDocument[]> {
  const sql = db();
  const ids = referencedLogoImages(badges);
  if (!sql || ids.length === 0) return [...badges];
  const images = await selectLogoImages(sql, ids);
  return replaceLogoImages(badges, (src) => {
    const png = images.get(src.slice(src.lastIndexOf("/") + 1));
    return png ? pngDataUrl(png) : undefined;
  });
}

/** Sant när någon skylt pekar på en bild som inte finns på servern. */
export async function missingLogoImages(badges: readonly BadgeDocument[]): Promise<boolean> {
  const sql = db();
  const ids = referencedLogoImages(badges);
  if (ids.length === 0) return false;
  if (!sql) return true;
  return (await selectLogoImages(sql, ids)).size < ids.length;
}
