import { NextResponse } from "next/server";
import { z } from "zod";
import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { scrapeBrand } from "@/lib/brand/profile";
import { FetchBlockedError } from "@/lib/brand/url";

export const runtime = "nodejs";
export const maxDuration = 60;

const HOUR_MS = 60 * 60 * 1000;
/** Varje hämtning når en främmande server och kan kosta en AI-fråga. */
const perClient = createRateLimiter({ limit: 15, windowMs: HOUR_MS });
const site = createRateLimiter({ limit: 300, windowMs: HOUR_MS });

const requestSchema = z.object({ url: z.string().trim().min(4).max(300) });

/** Läser logga, typsnitt, färger och bransch ur företagets hemsida. */
export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Skriv in en webbadress" }, { status: 400 });
  if (!perClient.take(clientKey(request)) || !site.take("site")) {
    return NextResponse.json({ error: "Många hämtningar på kort tid. Försök igen om en stund." }, { status: 429 });
  }

  try {
    return NextResponse.json(await scrapeBrand(parsed.data.url));
  } catch (error) {
    if (error instanceof FetchBlockedError || error instanceof TypeError) {
      return NextResponse.json({ error: "Adressen går inte att hämta. Kontrollera att den stämmer." }, { status: 400 });
    }
    console.error("Kunde inte läsa hemsidan", error);
    return NextResponse.json(
      { error: "Vi kunde inte läsa sidan. Prova startsidan, eller ladda upp loggan själv." },
      { status: 502 },
    );
  }
}
