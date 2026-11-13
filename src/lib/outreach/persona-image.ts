import sharp from "sharp";

/** Stående 4:5 — syns hel i mobilens inkorg utan att man scrollar förbi den. */
export const PERSONA_WIDTH_PX = 600;
export const PERSONA_HEIGHT_PX = 750;
export const MAX_PERSONA_BYTES = 120_000;

/**
 * Bildmodellen ger 2:3. Beskärs uppifrån så att ansiktet och skylten på
 * bröstet blir kvar och det som skärs bort är midjan.
 */
export async function personaJpeg(source: Buffer): Promise<{ bytes: Buffer; width: number; height: number }> {
  for (const quality of [78, 68, 58]) {
    const bytes = await sharp(source)
      .rotate()
      .resize(PERSONA_WIDTH_PX, PERSONA_HEIGHT_PX, { fit: "cover", position: "north" })
      .jpeg({ quality, mozjpeg: true, progressive: true })
      .toBuffer();
    if (bytes.length <= MAX_PERSONA_BYTES) return { bytes, width: PERSONA_WIDTH_PX, height: PERSONA_HEIGHT_PX };
  }
  throw new Error("Personbilden blir för stor för ett mejl");
}
