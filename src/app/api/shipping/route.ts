import { NextResponse } from "next/server";
import { orderShippingChoices } from "@/engine/price-model";
import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { priceModelOrDefault } from "@/lib/orders/repository";
import { shippingRequestSchema } from "@/lib/orders/shipping";

export const runtime = "nodejs";

const HOUR_MS = 60 * 60 * 1000;
/** Skyltmotorn frågar varje gång antalet eller skylttypen ändras. Gränsen stoppar den som frågar för att räkna ut inköpspriserna. */
const perClient = createRateLimiter({ limit: 1200, windowMs: HOUR_MS });

/**
 * Frakten för en order som inte är lagd än. Svaret är bara belopp: standardfrakten, och
 * paketets pris när kunden kan välja paket i stället för varubrevet. Frakten räknas på det
 * återförsäljaren betalar för varorna, och de priserna får aldrig nå kundens webbläsare.
 */
export async function POST(request: Request) {
  const parsed = shippingRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ogiltiga skyltar" }, { status: 400 });
  if (!perClient.take(clientKey(request))) return NextResponse.json({ error: "För många frågor" }, { status: 429 });
  const { shippingSek, parcelSek, extraDeliverySek } = orderShippingChoices(await priceModelOrDefault(), parsed.data.items);
  return NextResponse.json({ shippingSek, parcelSek, extraDeliverySek }, { headers: { "cache-control": "no-store" } });
}
