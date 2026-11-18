/**
 * Vad sökmotorer får se. Så länge sajten är låst med sajtlösenordet ska inget
 * indexeras: robots säger nej till allt och sitemapen är tom. När spärren tas
 * bort gäller reglerna nedan, och sitemapen listar de publika sidorna.
 */

/** Sidorna som får hittas via sökmotorer. Butiker, hemliga länkar och panelen står aldrig här. */
export const PUBLIC_PATHS = ["/", "/skapa", "/foretag", "/inspiration", "/om-oss", "/kontakt", "/villkor", "/integritet"] as const;

/** Personliga länkar och butiksförhandsvisningar ska aldrig hamna i sökmotorer. */
const PRIVATE_PATHS = ["/for/", "/avregistrera/", "/utskick/", "/aterforsaljare/", "/admin", "/api/"];

export interface RobotsFile {
  rules: { userAgent: string; allow?: string; disallow: string | string[] };
  sitemap?: string;
}

/** Innehållet i robots.txt. `locked` = sajtlösenordet är på. */
export function robotsFor(locked: boolean, origin: string): RobotsFile {
  if (locked) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS }, sitemap: `${origin}/sitemap.xml` };
}

export interface SitemapEntry {
  url: string;
  changeFrequency: "weekly" | "monthly" | "yearly";
  priority: number;
}

/** Sitemapens sidor. Tom så länge sajten är låst. */
export function sitemapFor(locked: boolean, origin: string): SitemapEntry[] {
  if (locked) return [];
  return PUBLIC_PATHS.map((path) => ({
    url: `${origin}${path === "/" ? "" : path}`,
    changeFrequency: path === "/villkor" || path === "/integritet" ? "yearly" : path === "/" || path === "/skapa" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : path === "/skapa" ? 0.9 : path === "/villkor" || path === "/integritet" ? 0.3 : 0.7,
  }));
}
