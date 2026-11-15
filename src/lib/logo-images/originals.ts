import "server-only";
import { createHash } from "node:crypto";
import { LOGO_ORIGINAL_ID_PATTERN, type BadgeDocument } from "@/engine";
import { db } from "@/lib/db/client";
import {
  LOGO_ORIGINAL_MAX_BYTES,
  cleanFileName,
  detectLogoFileType,
  referencedLogoOriginals,
  withoutLogoOriginals,
} from "./original-model";
import { insertLogoOriginal, selectLogoOriginal, selectLogoOriginalInfo, type LogoOriginalInfo, type LogoOriginalRow } from "./store";

/**
 * Sparar loggans originalfil och ger dess id, filens SHA-256. Samma fil sparas
 * en enda gång. `null` när filen är tom, för stor eller av en typ som inte tas
 * emot, eller när databasen saknas: skylten klarar sig då utan hänvisningen.
 */
export async function storeLogoOriginal(bytes: Uint8Array, name?: string | null): Promise<string | null> {
  const sql = db();
  if (!sql || bytes.length === 0 || bytes.length > LOGO_ORIGINAL_MAX_BYTES) return null;
  const type = detectLogoFileType(bytes);
  if (!type) return null;
  const id = createHash("sha256").update(bytes).digest("hex");
  await insertLogoOriginal(sql, { id, mime: type.mime, name: cleanFileName(name), bytes });
  return id;
}

/** Filen som laddas ner i panelen. `null` när id:t inte är en SHA-256 eller filen inte finns. */
export async function getLogoOriginal(id: string): Promise<LogoOriginalRow | null> {
  const sql = db();
  if (!sql || !LOGO_ORIGINAL_ID_PATTERN.test(id)) return null;
  return selectLogoOriginal(sql, id);
}

/** Originalfilerna som skyltarna pekar på och som finns kvar: namn, typ och storlek. */
export async function logoOriginalsOf(badges: readonly BadgeDocument[]): Promise<LogoOriginalInfo[]> {
  const sql = db();
  const ids = referencedLogoOriginals(badges);
  if (!sql || ids.length === 0) return [];
  const found = new Map((await selectLogoOriginalInfo(sql, ids)).map((file) => [file.id, file]));
  // Samma ordning som skyltarna, så att listan inte hoppar mellan sidvisningar.
  return ids.flatMap((id) => found.get(id) ?? []);
}

/**
 * Skyltarna så som de ska sparas: en hänvisning till en originalfil som inte
 * finns på servern tas bort. En sparad order pekar därför aldrig på en fil som
 * saknas, vare sig id:t kom från en gammal delad länk eller är påhittat.
 */
export async function withKnownLogoOriginals(badges: readonly BadgeDocument[]): Promise<BadgeDocument[]> {
  const sql = db();
  const ids = referencedLogoOriginals(badges);
  // Utan databas sparas ingenting, så det finns inget att hålla rent.
  if (!sql || ids.length === 0) return [...badges];
  const known = new Set((await selectLogoOriginalInfo(sql, ids)).map((file) => file.id));
  return withoutLogoOriginals(badges, (id) => !known.has(id));
}
