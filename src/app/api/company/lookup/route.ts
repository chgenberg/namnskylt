import { NextResponse } from "next/server";
import { clientKey, createRateLimiter } from "@/lib/ai/rate-limit";
import { lookupCompany } from "@/lib/company/lookup";
import { lookupNumber } from "@/lib/company/lookup-model";

export const runtime = "nodejs";

const perClient = createRateLimiter({ limit: 40, windowMs: 60 * 60 * 1000 });

/**
 * Företagets namn och adress för ett organisationsnummer, så att kassan kan
 * fylla i dem. Svaret är alltid `found` sant eller falskt: ett nummer som inte
 * finns, ett register som inte svarar och en nådd gräns ser likadana ut för
 * den som frågar, och kassan fungerar utan svaret.
 */
export async function GET(request: Request) {
  const digits = lookupNumber(new URL(request.url).searchParams.get("orgNumber"));
  if (!digits) return NextResponse.json({ found: false });
  if (!perClient.take(clientKey(request))) return NextResponse.json({ found: false }, { status: 429 });
  const company = await lookupCompany(digits);
  return NextResponse.json(company ? { found: true, company } : { found: false });
}
