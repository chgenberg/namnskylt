export class FetchBlockedError extends Error {}

const ALLOWED_PORTS = new Set(["", "80", "443"]);

/**
 * Bara http(s) på standardportar och värdnamn — inte rå IP-adress, inte
 * inloggningsuppgifter i adressen. Själva adresskontrollen sker vid uppslaget.
 */
export function parsePublicUrl(raw: string): URL {
  const trimmed = raw.trim();
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new FetchBlockedError("Ogiltig adress");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchBlockedError("Protokoll");
  if (url.username || url.password) throw new FetchBlockedError("Inloggning i adressen");
  if (!ALLOWED_PORTS.has(url.port)) throw new FetchBlockedError("Port");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const isIpLiteral = /^[\d.]+$/.test(host) || host.includes(":");
  if (
    isIpLiteral ||
    !host.includes(".") ||
    host === "localhost" ||
    /\.(local|internal|localhost|lan|home|corp)$/.test(host)
  ) {
    throw new FetchBlockedError("Värd");
  }
  return url;
}

/** Bildtjänsterna i Next.js och hos Vercel: adressen till originalet står i parametern `url`. */
const IMAGE_SERVICE_PATH = /\/_(next|vercel)\/image\/?$/;

/**
 * Originalet bakom en bildtjänst, när adressen pekar ut det. Tjänsten krymper bilden till
 * den storlek sidan visar den i (ofta under 100 px för en logga) och gör om den till ett
 * annat format. Originalet är skarpare att spåra. `null` när adressen inte är en sådan tjänst.
 */
export function unoptimizedImageUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    const inner = IMAGE_SERVICE_PATH.test(url.pathname) ? url.searchParams.get("url") : null;
    if (!inner) return null;
    const original = new URL(inner, url);
    return original.protocol === "http:" || original.protocol === "https:" ? original.href : null;
  } catch {
    return null;
  }
}

/** Många företag svarar bara på `www.` — adressen att prova när den bara domänen inte går. */
export function withWww(url: URL): URL | null {
  if (url.hostname.startsWith("www.") || url.hostname.split(".").length !== 2) return null;
  const alternate = new URL(url.href);
  alternate.hostname = `www.${url.hostname}`;
  return alternate;
}
