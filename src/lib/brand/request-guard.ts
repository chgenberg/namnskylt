import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPublicAddress } from "./ip";

const ALLOWED_PORTS = new Set(["", "80", "443"]);
/** Ljud, video och strömmar behövs inte för att läsa ett varumärke. */
const BLOCKED_RESOURCES = new Set(["media", "websocket", "eventsource", "manifest", "texttrack"]);
/** Kort cache: webbläsaren slår upp själv, så ett gammalt svar får inte leva länge. */
const HOST_CACHE_MS = 60_000;
const MAX_CACHED_HOSTS = 500;

type Resolve = (host: string) => Promise<readonly string[]>;

const resolveAll: Resolve = async (host) => (await lookup(host, { all: true })).map((a) => a.address);
const hostCache = new Map<string, { at: number; ok: Promise<boolean> }>();

/** `true` bara om värden enbart pekar på publika adresser. */
export function isPublicHost(hostname: string, resolve: Resolve = resolveAll, nowMs = Date.now()): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(host)) return Promise.resolve(isPublicAddress(host));
  if (host === "localhost" || host.endsWith(".localhost") || !host.includes(".")) return Promise.resolve(false);
  const cached = hostCache.get(host);
  if (cached && nowMs - cached.at < HOST_CACHE_MS) return cached.ok;
  if (hostCache.size >= MAX_CACHED_HOSTS) hostCache.clear();
  const ok = resolve(host)
    .then((all) => all.length > 0 && all.every(isPublicAddress))
    .catch(() => false);
  hostCache.set(host, { at: nowMs, ok });
  return ok;
}

/**
 * Varje anrop den renderade sidan gör — sidan själv, skript, bilder, fetch —
 * passerar här. Bara http(s) mot publika adresser på standardportar.
 */
export async function allowBrowserRequest(raw: string, resourceType: string, resolve?: Resolve): Promise<boolean> {
  if (raw.startsWith("data:") || raw.startsWith("blob:")) return true;
  if (BLOCKED_RESOURCES.has(resourceType)) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password || !ALLOWED_PORTS.has(url.port)) return false;
  return isPublicHost(url.hostname, resolve);
}
