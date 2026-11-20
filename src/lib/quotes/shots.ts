import "server-only";
import { z } from "zod";
import { badgeShotUploadSchema, normalizeBadgeShot } from "@/lib/images/badge-shot";
import { QUOTE_SHOT_ANGLES, QUOTE_SHOT_DESIGNS, type QuoteShot } from "./model";

const shotSchema = badgeShotUploadSchema.unwrap();

/**
 * Bilderna ur 3D-vyn som de skickas från skyltmotorn, en plats per design: en stor och små ur
 * andra vinklar. `null` = designen ritas som ritning.
 */
export const quoteShotsUploadSchema = z
  .array(z.object({ main: shotSchema, angles: z.array(shotSchema).max(QUOTE_SHOT_ANGLES) }).nullable())
  .max(QUOTE_SHOT_DESIGNS)
  .optional();

/** Bilderna kommer från klienten: var och en avkodas och kodas om, så att inget annat än pixlar sparas. */
export async function normalizeQuoteShots(shots: z.infer<typeof quoteShotsUploadSchema>): Promise<(QuoteShot | null)[] | null> {
  if (!shots) return null;
  const normalized: (QuoteShot | null)[] = [];
  for (const shot of shots) {
    const main = shot ? await normalizeBadgeShot(shot.main) : null;
    if (!shot || !main) {
      normalized.push(null);
      continue;
    }
    const angles: string[] = [];
    for (const angle of shot.angles) {
      const image = await normalizeBadgeShot(angle);
      if (image) angles.push(image);
    }
    normalized.push({ main, angles });
  }
  return normalized;
}
