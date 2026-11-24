import { NextResponse } from "next/server";
import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { lookupCompany } from "@/lib/company/lookup";
import { lookupNumber } from "@/lib/company/lookup-model";

export const runtime = "nodejs";

const perClient = createRateLimiter({ limit: 40, windowMs: 60 * 60 * 1000 });

/**
 * Företagets namn och adress för ett organisationsnummer, så att kassan kan
 * fylla i dem. Svaret är `found` sant eller falskt, och `unavailable` när
 * registret inte svarade: då ska kassan inte säga att numret saknas. Kassan
 * fungerar utan svaret.
 */
export async function GET(request: Request) {
  const digits = lookupNumber(new URL(request.url).searchParams.get("orgNumber"));
  if (!digits) return NextResponse.json({ found: false });
  if (!perClient.take(clientKey(request))) return NextResponse.json({ found: false }, { status: 429 });
  const result = await lookupCompany(digits);
  // Bara registrets eget svar får säga att numret saknas. Svarar det inte säger kassan inget om numret.
  if (result.kind === "found") return NextResponse.json({ found: true, company: result.company });
  return NextResponse.json(result.kind === "missing" ? { found: false } : { found: false, unavailable: true });
}
