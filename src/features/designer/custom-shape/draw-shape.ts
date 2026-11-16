import type { TracedOutline } from "@/engine";
import { readShapeFile } from "./read-shape-file";

const DRAW_URL = "/api/custom-shape/draw";
const NO_SHAPE = 'Det blev ingen tydlig form av den beskrivningen. Beskriv en enda sak, till exempel "en häst", och försök igen.';

let availability: Promise<boolean> | null = null;

/**
 * Om formen går att rita ur en beskrivning: bara när servern har bildmodellen
 * inkopplad. Frågan ställs en gång per sidladdning; går den inte att ställa
 * räknas funktionen som avstängd.
 */
export function shapeDrawingAvailable(): Promise<boolean> {
  availability ??= fetch(DRAW_URL)
    .then((response) => (response.ok ? (response.json() as Promise<{ available?: unknown }>) : null))
    .then((body) => body?.available === true)
    .catch(() => false);
  return availability;
}

type DrawnShape = { ok: true; outline: TracedOutline } | { ok: false; message: string };

function pngFile(dataUrl: string): File | null {
  const [head, base64] = dataUrl.split(",");
  if (!base64 || !head?.startsWith("data:image/png;base64")) return null;
  try {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    return new File([bytes], "beskriven-form.png", { type: "image/png" });
  } catch {
    return null;
  }
}

/**
 * Ber servern rita formen kunden beskriver och läser bilden som en uppladdad
 * fil (`readShapeFile`), så att den blir samma slags kontur med samma
 * kontroller. Kastar bara när anropet avbryts med `signal`.
 */
export async function drawDescribedShape(description: string, signal: AbortSignal): Promise<DrawnShape> {
  let response: Response;
  try {
    response = await fetch(DRAW_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description }),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    return { ok: false, message: "Det gick inte att nå servern. Kontrollera anslutningen och försök igen." };
  }
  const body = (await response.json().catch(() => null)) as { image?: unknown; error?: unknown } | null;
  if (!response.ok || typeof body?.image !== "string") {
    const message = typeof body?.error === "string" ? body.error : "Formen kunde inte ritas just nu. Försök igen om en stund.";
    return { ok: false, message };
  }
  const file = pngFile(body.image);
  const read = file ? await readShapeFile(file).catch(() => null) : null;
  return read?.ok ? { ok: true, outline: read.outline } : { ok: false, message: NO_SHAPE };
}
