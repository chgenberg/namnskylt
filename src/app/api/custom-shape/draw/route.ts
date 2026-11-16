import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { openai } from "@/lib/ai/openai";
import { clientKey } from "@/lib/ai/rate-limit";
import { NoShapeError, drawShapeImage, shapeLimits } from "@/lib/ai/shape-image";
import { SHAPE_LIMIT_TEXT } from "@/lib/ai/shape-limits";
import { SHAPE_DESCRIPTION_MAX, shapeDescriptionSchema } from "@/lib/ai/shape-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const requestSchema = z.strictObject({ description: shapeDescriptionSchema });

/** Ritverktyget frågar här om rutan "Beskriv formen" ska visas: bara när bildmodellen är inkopplad. */
export function GET() {
  return NextResponse.json({ available: openai() !== null }, { headers: { "cache-control": "no-store" } });
}

/**
 * Ritar en egen form ur kundens beskrivning. Svaret är en svartvit bild av
 * siluetten, som webbläsaren spårar till en kontur på samma sätt som en
 * uppladdad fil. Varje anrop är en bildgenerering och räknas mot gränserna.
 */
export async function POST(request: Request) {
  const ai = openai();
  if (!ai) return NextResponse.json({ error: "Ritfunktionen är inte aktiverad." }, { status: 503 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Beskriv formen med ett par ord, högst ${SHAPE_DESCRIPTION_MAX} tecken. Till exempel "en häst".` },
      { status: 400 },
    );
  }
  const hit = shapeLimits.take(clientKey(request));
  if (hit) return NextResponse.json({ error: SHAPE_LIMIT_TEXT[hit] }, { status: 429 });

  try {
    return NextResponse.json({ image: await drawShapeImage(ai, parsed.data.description) });
  } catch (error) {
    if (error instanceof NoShapeError) {
      return NextResponse.json(
        { error: "Det blev ingen tydlig form av den beskrivningen. Beskriv en enda sak, till exempel \"en häst\", och försök igen." },
        { status: 422 },
      );
    }
    if (error instanceof OpenAI.APIError && error.code === "moderation_blocked") {
      return NextResponse.json(
        { error: "Den beskrivningen går inte att rita. Prova att beskriva formen med andra ord." },
        { status: 422 },
      );
    }
    // Bara felets slag loggas: beskrivningen är kundens egen text och hör inte hemma i loggen.
    const status = error instanceof OpenAI.APIError ? error.status : undefined;
    console.error("Formen kunde inte ritas", error instanceof Error ? error.name : "okänt fel", status ?? "");
    return NextResponse.json({ error: "Formen kunde inte ritas just nu. Försök igen om en stund." }, { status: 502 });
  }
}
