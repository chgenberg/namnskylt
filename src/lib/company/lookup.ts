import "server-only";
import { createRateLimiter } from "@/lib/ai/rate-limit";
import { companyFromVies, vatNumberOf, viesUnavailable, type CompanyHit } from "./lookup-model";

/** EU:s momsregister. Gratis, utan nyckel, och svarar med namn och adress för ett momsregistrerat företag. */
const VIES_URL = "https://ec.europa.eu/taxation_customs/vies/rest-api/ms/SE/vat/";
const TIMEOUT_MS = 6_000;
const HOUR_MS = 60 * 60 * 1000;
/** Ett företags uppgifter ändras sällan. Ett nummer som inte finns kan ha skrivits fel och frågas om tidigare. */
const FOUND_MS = 24 * HOUR_MS;
const MISSING_MS = HOUR_MS;
const CACHE_ENTRIES = 2_000;
/** Taket för hela sajten per dygn, så att registret aldrig belastas genom oss. */
const perDay = createRateLimiter({ limit: 3_000, windowMs: 24 * HOUR_MS });

const cache = new Map<string, { hit: CompanyHit | null; until: number }>();

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Företagets namn och adress för ett organisationsnummer (tio siffror, en
 * juridisk person: se `lookupNumber`). `null` när numret inte finns i
 * registret, när registret inte svarar eller när dygnets tak är nått:
 * uppslaget är en hjälp, och kassan fungerar lika bra utan det.
 */
export async function lookupCompany(digits: string, fetchImpl: Fetch = fetch, now = Date.now()): Promise<CompanyHit | null> {
  const cached = cache.get(digits);
  if (cached && cached.until > now) return cached.hit;
  if (!perDay.take("alla", 1, now)) return null;
  try {
    const response = await fetchImpl(`${VIES_URL}${vatNumberOf(digits)}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    // Registret kunde inte svara just nu: det sparas inte, så att nästa försök frågar igen.
    if (viesUnavailable(body)) return null;
    const hit = companyFromVies(body);
    if (cache.size >= CACHE_ENTRIES) cache.delete(cache.keys().next().value ?? "");
    cache.set(digits, { hit, until: now + (hit ? FOUND_MS : MISSING_MS) });
    return hit;
  } catch {
    return null;
  }
}
