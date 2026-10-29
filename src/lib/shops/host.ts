import { SHOP_SLUG } from "./model-slug";

/** Butikerna får en egen underadress: kontorsprofilen.namnskylt.com. */
export const SHOP_ROOT_DOMAIN = "namnskylt.com";
/** Underadresser som inte är butiker. */
const RESERVED = new Set(["www", "api", "admin", "app", "mail", "verkstad", "status", "cdn", "static"]);
const HOSTNAME = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export type HostTarget = { kind: "main" } | { kind: "subdomain"; slug: string } | { kind: "custom"; host: string };

/** Värdnamnet utan port och avslutande punkt, med gemener. */
export function normalizeHost(raw: string | null | undefined): string {
  return ((raw ?? "").split(",")[0] ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

export function isValidDomain(host: string): boolean {
  return HOSTNAME.test(host) && !host.endsWith(`.${SHOP_ROOT_DOMAIN}`) && host !== SHOP_ROOT_DOMAIN;
}

/**
 * Vilken sajt en adress är: vår egen, en butiks underadress eller en
 * återförsäljares egen domän. Okända lokala namn räknas som vår.
 */
export function resolveHost(raw: string | null | undefined, mainHosts: readonly string[] = []): HostTarget {
  const host = normalizeHost(raw);
  if (!host || mainHosts.includes(host) || host === SHOP_ROOT_DOMAIN || !host.includes(".")) return { kind: "main" };
  if (host.endsWith(".railway.app") || host.endsWith(".up.railway.app") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return { kind: "main" };
  if (host.endsWith(`.${SHOP_ROOT_DOMAIN}`)) {
    const sub = host.slice(0, -SHOP_ROOT_DOMAIN.length - 1);
    return !RESERVED.has(sub) && SHOP_SLUG.test(sub) ? { kind: "subdomain", slug: sub } : { kind: "main" };
  }
  return isValidDomain(host) ? { kind: "custom", host } : { kind: "main" };
}

/** Sökvägen på butikens egen adress → vår interna /butik/<slug>/… */
export function shopRewritePath(slug: string, pathname: string): string | null {
  if (pathname.startsWith("/butik/") || pathname.startsWith("/_next") || pathname.startsWith("/api/")) return null;
  if (pathname.startsWith("/korrektur/") || pathname.startsWith("/offert/") || pathname.startsWith("/inbaddning/")) return null;
  if (/\.[a-z0-9]{2,5}$/i.test(pathname)) return null;
  return `/butik/${slug}${pathname === "/" ? "" : pathname}`;
}
