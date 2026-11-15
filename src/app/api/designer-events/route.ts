import { NextResponse } from "next/server";
import { z } from "zod";
import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { DESIGNER_EVENT_STEPS, VISIT_ID_PATTERN, WEB_SCOPE } from "@/lib/designer-stats/model";
import { recordDesignerEvent } from "@/lib/designer-stats/repository";
import { databaseConfigured } from "@/lib/orders/repository";
import { SHOP_SLUG } from "@/lib/shops/model-slug";

export const runtime = "nodejs";

const HOUR_MS = 60 * 60 * 1000;
/** Ett besök skickar högst sju händelser. Gränsen stoppar den som försöker fylla tabellen. */
const perClient = createRateLimiter({ limit: 120, windowMs: HOUR_MS });
const site = createRateLimiter({ limit: 20_000, windowMs: HOUR_MS });

const eventSchema = z.strictObject({
  visit: z.string().regex(VISIT_ID_PATTERN),
  scope: z.union([z.literal(WEB_SCOPE), z.string().regex(SHOP_SLUG)]),
  step: z.enum(DESIGNER_EVENT_STEPS),
});

const done = () => new NextResponse(null, { status: 204 });

/**
 * Skyltmotorn säger hur långt ett besök har kommit. Svaret är alltid 204: det
 * här är statistik, och den får aldrig ge besökaren ett fel. Inget om
 * besökaren sparas, varken adress eller vad som står på skylten.
 */
export async function POST(request: Request) {
  try {
    const parsed = eventSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !databaseConfigured()) return done();
    if (!perClient.take(clientKey(request)) || !site.take("site")) return done();
    await recordDesignerEvent(parsed.data.visit, parsed.data.scope, parsed.data.step);
  } catch (error) {
    console.error("Skyltmotorns händelse sparades inte", error);
  }
  return done();
}
