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

/** Många företag svarar bara på `www.` — adressen att prova när den bara domänen inte går. */
export function withWww(url: URL): URL | null {
  if (url.hostname.startsWith("www.") || url.hostname.split(".").length !== 2) return null;
  const alternate = new URL(url.href);
  alternate.hostname = `www.${url.hostname}`;
  return alternate;
}
