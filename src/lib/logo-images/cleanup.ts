import "server-only";
import { db } from "@/lib/db/client";
import { deleteUnusedLogoRows } from "./store";

/**
 * Städar bort loggor som ingen skylt pekar på längre: bilderna i `logo_images`
 * och originalfilerna i `logo_originals`. En fil ligger alltid kvar i minst
 * `olderThanDays` dagar, så att en nyuppladdad logga överlever tills ordern
 * läggs. Följden är att en delad länk som aldrig blev en order eller offert
 * tappar sin logga i färg efter den tiden. Gör ingenting utan databas.
 */
export async function deleteUnusedLogoFiles(olderThanDays = 30): Promise<{ images: number; originals: number }> {
  const sql = db();
  return sql ? deleteUnusedLogoRows(sql, olderThanDays) : { images: 0, originals: 0 };
}
