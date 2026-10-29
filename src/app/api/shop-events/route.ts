import { NextResponse } from "next/server";
import { z } from "zod";
import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { databaseConfigured } from "@/lib/orders/repository";
import { SHOP_EVENT_KINDS } from "@/lib/shops/events";
import { SHOP_SLUG } from "@/lib/shops/model-slug";
import { recordShopEvent } from "@/lib/shops/stats";

export const runtime = "nodejs";

const HOUR_MS = 60 * 60 * 1000;
/** Öppen adress — den anropas från återförsäljarnas sajter, utan vår kaka. */
const perClient = createRateLimiter({ limit: 60, windowMs: HOUR_MS });

const eventSchema = z.object({ slug: z.string().regex(SHOP_SLUG), kind: z.enum(SHOP_EVENT_KINDS) });

export async function POST(request: Request) {
  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !databaseConfigured()) return new NextResponse(null, { status: 204 });
  if (!perClient.take(clientKey(request))) return new NextResponse(null, { status: 204 });
  await recordShopEvent(parsed.data.slug, parsed.data.kind).catch((error) => console.error("Butikshändelsen sparades inte", error));
  return new NextResponse(null, { status: 204 });
}
