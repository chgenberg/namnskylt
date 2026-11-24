import "server-only";
import { createRateLimiter } from "@/lib/ai/rate-limit";
import { companyFromVies, vatNumberOf, viesUnavailable, type CompanyHit } from "./lookup-model";

/** EU:s momsregister. Gratis, utan nyckel, och svarar med namn och adress för ett momsregistrerat företag. */
const VIES_URL = "https://ec.europa.eu/taxation_customs/vies/rest-api/ms/SE/vat/";
/** Registret svarar ofta på ett par sekunder men ibland på sex: varje försök får åtta. */
const TIMEOUT_MS = 8_000;
/** Svarar registret inte görs ett nytt försök efter en kort paus. */
const RETRY_DELAY_MS = 600;
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
 * Svaret från uppslaget. Bara ett riktigt svar från registret får säga att numret saknas (`missing`);
 * ett register som inte svarar i tid, är upptaget eller svarar med fel är `unavailable`, och då säger
 * kassan inget om numret (rättat 2026-11-24: ett långsamt svar visades som "Vi hittade inga uppgifter").
 */
export type CompanyLookup = { kind: "found"; company: CompanyHit } | { kind: "missing" } | { kind: "unavailable" };

const UNAVAILABLE: CompanyLookup = { kind: "unavailable" };
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function askRegister(digits: string, fetchImpl: Fetch): Promise<CompanyLookup> {
  try {
    const response = await fetchImpl(`${VIES_URL}${vatNumberOf(digits)}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return UNAVAILABLE;
    const body: unknown = await response.json();
    if (viesUnavailable(body)) return UNAVAILABLE;
    const hit = companyFromVies(body);
    return hit ? { kind: "found", company: hit } : { kind: "missing" };
  } catch {
    return UNAVAILABLE;
  }
}

/**
 * Företagets namn och adress för ett organisationsnummer (tio siffror, en juridisk person: se
 * `lookupNumber`). Svarar registret inte görs ett nytt försök. Ett svar sparas en stund; ett register
 * som inte svarade sparas inte, så att nästa fråga försöker igen. Kastar aldrig: uppslaget är en
 * hjälp, och kassan fungerar lika bra utan det.
 */
export async function lookupCompany(
  digits: string,
  fetchImpl: Fetch = fetch,
  now = Date.now(),
  pause: (ms: number) => Promise<void> = wait,
): Promise<CompanyLookup> {
  const cached = cache.get(digits);
  if (cached && cached.until > now) return cached.hit ? { kind: "found", company: cached.hit } : { kind: "missing" };
  if (!perDay.take("alla", 1, now)) return UNAVAILABLE;
  let result = await askRegister(digits, fetchImpl);
  if (result.kind === "unavailable" && perDay.take("alla", 1, now)) {
    await pause(RETRY_DELAY_MS);
    result = await askRegister(digits, fetchImpl);
  }
  if (result.kind === "unavailable") return result;
  if (cache.size >= CACHE_ENTRIES) cache.delete(cache.keys().next().value ?? "");
  const hit = result.kind === "found" ? result.company : null;
  cache.set(digits, { hit, until: now + (hit ? FOUND_MS : MISSING_MS) });
  return result;
}
