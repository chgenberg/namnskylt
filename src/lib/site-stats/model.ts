import { createHmac } from "node:crypto";

/**
 * Besöksstatistik för namnskylt.com utan kakor (beslut av ägaren 2026-11-25), efter samma regler som
 * Skylt & Gravyrteknik har i sin integritetspolicy: inget sparas i besökarens webbläsare, IP-adressen
 * sparas aldrig, besökare räknas med en kod som byts varje dygn, och statistiken raderas efter 90 dagar.
 * Panelen, API:erna, verkstaden och återförsäljarnas butiker räknas inte.
 */

export const SITE_VISIT_DEVICES = ["dator", "telefon", "surfplatta"] as const;
export type SiteVisitDevice = (typeof SITE_VISIT_DEVICES)[number];

export const SITE_VISIT_RETENTION_DAYS = 90;

const BOT =
  /bot|crawl|spider|slurp|preview|fetch|monitor|headless|lighthouse|pagespeed|curl|wget|python|axios|node-fetch|go-http|java\/|facebookexternalhit|embedly|whatsapp|telegram|discord|skype|scanner|validator/i;

/** Robotar, länkförhandsvisningar och skript räknas inte. En webbläsare utan namn räknas inte heller. */
export function isBotAgent(userAgent: string | null | undefined): boolean {
  return !userAgent || userAgent.trim().length < 10 || BOT.test(userAgent);
}

export function deviceOf(userAgent: string): SiteVisitDevice {
  if (/ipad|tablet|android(?!.*mobile)/i.test(userAgent)) return "surfplatta";
  if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(userAgent)) return "telefon";
  return "dator";
}

/** Sidor som inte räknas: panelen, API:erna, verkstaden och återförsäljarnas butiker. */
const SKIPPED = [/^\/admin(\/|$)/, /^\/api\//, /^\/verkstad(\/|$)/, /^\/butik(\/|$)/, /^\/inbaddning(\/|$)/, /^\/_next\//];

/** Hemliga koder i adressen är behörigheter. De sparas aldrig: delen byts mot "[kod]". */
const SECRET_SEGMENTS: readonly (readonly [RegExp, string])[] = [
  [/^\/offert\/[^/]+/, "/offert/[kod]"],
  [/^\/order\/[^/]+/, "/order/[kod]"],
  [/^\/korrektur\/[^/]+/, "/korrektur/[kod]"],
  [/^\/f\/[^/]+/, "/f/[kod]"],
  [/^\/for\/[^/]+/, "/for/[kod]"],
  [/^\/avregistrera\/[^/]+/, "/avregistrera/[kod]"],
  [/^\/konto\/losenord\/[^/]+/, "/konto/losenord/[kod]"],
  [/^\/aterforsaljare\/konto\/[^/]+/, "/aterforsaljare/konto/[kod]"],
  [/^\/forhandsvisning\/[^/]+/, "/forhandsvisning/[kod]"],
  [/^\/aterforsaljare\/(?!ansok$|glomt$|konto(\/|$))[^/]+$/, "/aterforsaljare/[kod]"],
];

/** Sidans adress som den sparas, eller `null` för en sida som inte räknas. Frågor och ankare tas bort. */
export function cleanPath(raw: string): string | null {
  let path = raw.split(/[?#]/)[0] ?? "";
  if (!path.startsWith("/") || path.length > 300) return null;
  path = path.replace(/\/+$/, "") || "/";
  if (SKIPPED.some((pattern) => pattern.test(path))) return null;
  for (const [pattern, replacement] of SECRET_SEGMENTS) {
    if (pattern.test(path)) return path.replace(pattern, replacement);
  }
  return path.slice(0, 200);
}

/** Värdnamnet på sidan besökaren kom ifrån, utan www, eller `null` för sajten själv och okända adresser. */
export function referrerHost(referrer: string | null | undefined, ownHosts: readonly string[]): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, "");
    if (!host || ownHosts.some((own) => host === own || host.endsWith(`.${own}`))) return null;
    return host.slice(0, 100);
  } catch {
    return null;
  }
}

/** Kampanjen besökaren kom från: "utskick" för länken i utskicksmejlet (`?k=`), annars `utm_source`. */
export function sourceOf(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (params.get("k")) return "utskick";
  const utm = (params.get("utm_source") ?? "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 40);
  return utm || null;
}

/** Dagens datum i Sverige, "2026-11-25". Koden för en besökare byts när datumet byts. */
export function stockholmDay(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/**
 * Dygnets kod för en besökare: HMAC av dag, IP och webbläsare med en hemlighet som bara servern har. Samma
 * besökare får en ny kod nästa dag, och koden går inte att räkna tillbaka till en IP-adress.
 */
export function visitorOf(ip: string, userAgent: string, day: string, secret: string): string {
  return createHmac("sha256", secret).update(`${day}|${ip}|${userAgent}`).digest("hex").slice(0, 16);
}
