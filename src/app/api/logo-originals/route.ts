import { NextResponse } from "next/server";
import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { LOGO_ORIGINAL_MAX_BYTES, detectLogoFileType } from "@/lib/logo-images/original-model";
import { storeLogoOriginal } from "@/lib/logo-images/originals";

export const runtime = "nodejs";

const HOUR_MS = 60 * 60 * 1000;
const MEGABYTE = 1024 * 1024;
/**
 * Gränserna räknas i megabyte, inte i antal filer: en kund provar några loggor
 * på en bråkdel av en megabyte, och ingen ska kunna fylla databasen med stora filer.
 */
const perClient = createRateLimiter({ limit: 60, windowMs: HOUR_MS });
const site = createRateLimiter({ limit: 1000, windowMs: HOUR_MS });

const tooLarge = () => NextResponse.json({ error: "Filen är för stor (max 10 MB)" }, { status: 413 });

/** Förfrågans innehåll, högst `maxBytes`. `"too-large"` så fort gränsen passeras, utan att läsa resten. */
async function readBody(request: Request, maxBytes: number): Promise<Uint8Array | "too-large"> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return "too-large";
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, size);
}

/** Filens namn ur huvudet, som skyltmotorn skickar det. Ett namn som inte går att läsa är inget fel. */
function fileName(request: Request): string | null {
  const raw = request.headers.get("x-file-name");
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/**
 * Sparar filen kunden laddade upp som logga, som den är, och svarar med dess
 * id. Skyltmotorn lägger id:t på loggan, så att verkstaden kan få originalet.
 * Filen är förfrågans innehåll; typen läses ur innehållet, inte ur huvudet.
 */
export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > LOGO_ORIGINAL_MAX_BYTES) return tooLarge();
  // Utan angiven storlek räknas filen som den största som tas emot.
  const expected = Number.isFinite(declared) && declared > 0 ? declared : LOGO_ORIGINAL_MAX_BYTES;
  const cost = Math.max(1, Math.ceil(expected / MEGABYTE));
  if (!perClient.take(clientKey(request), cost) || !site.take("site", cost)) {
    return NextResponse.json({ error: "För många filer just nu. Försök igen om en stund." }, { status: 429 });
  }
  const bytes = await readBody(request, LOGO_ORIGINAL_MAX_BYTES).catch(() => new Uint8Array());
  if (bytes === "too-large") return tooLarge();
  if (bytes.length === 0) return NextResponse.json({ error: "Filen saknas" }, { status: 400 });
  if (!detectLogoFileType(bytes)) {
    return NextResponse.json({ error: "Filen måste vara SVG, PNG, JPG, WebP, GIF eller PDF" }, { status: 415 });
  }
  try {
    const id = await storeLogoOriginal(bytes, fileName(request));
    // Utan databas finns ingenstans att spara filen: skylten klarar sig utan hänvisningen.
    return id ? NextResponse.json({ id }) : NextResponse.json({ error: "Filen gick inte att spara" }, { status: 503 });
  } catch (error) {
    console.error("Loggans originalfil kunde inte sparas", error);
    return NextResponse.json({ error: "Filen gick inte att spara" }, { status: 503 });
  }
}
