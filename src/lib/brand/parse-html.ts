/**
 * Läser varumärkessignaler ur en sidas HTML utan DOM: loggkandidater,
 * stilmallar, färger, Google Fonts och sidans text. Allt är heuristik — det
 * som inte hittas lämnas tomt och kunden väljer själv.
 */

export type LogoCandidate =
  | { kind: "url"; url: string; score: number }
  | { kind: "svg"; markup: string; score: number };

export interface PageSignals {
  title: string;
  description: string;
  siteName: string;
  themeColor: string | null;
  logos: LogoCandidate[];
  stylesheets: string[];
  inlineCss: string;
  googleFonts: string[];
  text: string;
}

const TAG = /<(img|link|meta|source)\b([^>]*)>/gi;
const ATTRIBUTE = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
const MAX_INLINE_SVG_CHARS = 200_000;
const MAX_TEXT_CHARS = 2_500;
const MAX_STYLESHEETS = 4;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(Number(code.slice(1)));
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function attributes(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of raw.matchAll(ATTRIBUTE)) {
    const name = m[1]?.toLowerCase();
    if (name) map.set(name, decodeEntities(m[2] ?? m[3] ?? m[4] ?? ""));
  }
  return map;
}

function absolute(href: string | undefined, base: URL): string | null {
  if (!href || href.startsWith("data:") || href.startsWith("javascript:")) return null;
  try {
    const url = new URL(href.trim(), base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/** Första bilden i `srcset` — oftast den minsta, men loggor är vektor eller små ändå. */
function imageSource(attrs: Map<string, string>): string | undefined {
  const lazy = attrs.get("data-src") ?? attrs.get("data-lazy-src");
  const src = attrs.get("src");
  if (src && !src.startsWith("data:image/gif")) return src;
  if (lazy) return lazy;
  return attrs.get("srcset")?.split(",")[0]?.trim().split(/\s+/)[0];
}

/** Var `<header>` och `<footer>` ligger, för att väga loggor efter placering. */
function regions(html: string) {
  const headerStart = html.search(/<header\b/i);
  const headerEnd = headerStart >= 0 ? html.indexOf("</header>", headerStart) : -1;
  const footerStart = html.search(/<footer\b/i);
  return {
    inHeader: (i: number) => headerStart >= 0 && i >= headerStart && (headerEnd < 0 || i <= headerEnd),
    inFooter: (i: number) => footerStart >= 0 && i >= footerStart,
  };
}

const LOGO_HINT = /logo|logotyp|brand|varumärke/i;
const NOT_LOGO_HINT = /partner|client|kund|sponsor|certif|award|badge|payment|klarna|swish|visa|mastercard|trustpilot|app-?store|google-?play|facebook|instagram|linkedin|youtube|twitter/i;

function jsonLdLogos(html: string, base: URL): string[] {
  const found: string[] = [];
  const push = (value: unknown) => {
    const url = typeof value === "string" ? absolute(value, base) : null;
    if (url) found.push(url);
  };
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "logo") {
        // Både `logo: "url"` och `logo: { "@type": "ImageObject", url }` förekommer.
        push(child);
        if (child && typeof child === "object" && "url" in child) push(child.url);
      } else {
        visit(child);
      }
    }
  };
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(m[1] ?? ""));
    } catch {
      // Trasig JSON-LD är vanligt; den ignoreras.
    }
  }
  return found;
}

function inlineSvgLogos(html: string, inHeader: (i: number) => boolean, inFooter: (i: number) => boolean) {
  const found: LogoCandidate[] = [];
  for (const m of html.matchAll(/<svg\b[^>]*>/gi)) {
    const start = m.index;
    const end = html.indexOf("</svg>", start);
    if (end < 0 || end - start > MAX_INLINE_SVG_CHARS) continue;
    const before = html.slice(Math.max(0, start - 300), start);
    const opening = m[0];
    const hinted = LOGO_HINT.test(opening) || LOGO_HINT.test(before.slice(before.lastIndexOf("<")));
    if (!hinted) continue;
    const markup = html.slice(start, end + "</svg>".length);
    if (markup.length < 200) continue;
    found.push({
      kind: "svg",
      markup,
      score: 75 + (inHeader(start) ? 15 : 0) - (inFooter(start) ? 30 : 0),
    });
  }
  return found;
}

function visibleText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

function googleFontFamilies(href: string): string[] {
  try {
    const url = new URL(href);
    if (!url.hostname.endsWith("fonts.googleapis.com")) return [];
    return url.searchParams
      .getAll("family")
      .flatMap((value) => value.split("|"))
      .map((family) => family.split(":")[0]?.replace(/\+/g, " ").trim() ?? "")
      .filter((family) => family.length > 0);
  } catch {
    return [];
  }
}

export function parsePage(html: string, pageUrl: string): PageSignals {
  const base = new URL(pageUrl);
  const head = html.slice(0, 400_000);
  const { inHeader, inFooter } = regions(head);

  const meta = new Map<string, string>();
  const icons: LogoCandidate[] = [];
  const stylesheets: string[] = [];
  const googleFonts: string[] = [];
  const logos: LogoCandidate[] = [];

  for (const m of head.matchAll(TAG)) {
    const tag = m[1]?.toLowerCase();
    const attrs = attributes(m[2] ?? "");
    if (tag === "meta") {
      const key = (attrs.get("property") ?? attrs.get("name") ?? attrs.get("itemprop"))?.toLowerCase();
      const content = attrs.get("content");
      if (key && content && !meta.has(key)) meta.set(key, content.trim());
    } else if (tag === "link") {
      const rel = attrs.get("rel")?.toLowerCase() ?? "";
      const href = absolute(attrs.get("href"), base);
      if (!href) continue;
      if (rel.includes("stylesheet")) {
        const families = googleFontFamilies(href);
        if (families.length > 0) googleFonts.push(...families);
        else stylesheets.push(href);
      } else if (rel.includes("icon")) {
        const svg = /\.svg(\?|$)/i.test(href) || attrs.get("type") === "image/svg+xml";
        const apple = rel.includes("apple-touch-icon");
        icons.push({ kind: "url", url: href, score: svg ? 40 : apple ? 30 : 15 });
      }
    } else if (tag === "img") {
      const src = absolute(imageSource(attrs), base);
      if (!src) continue;
      const hints = [attrs.get("class"), attrs.get("id"), attrs.get("alt"), src].join(" ");
      const before = head.slice(Math.max(0, m.index - 250), m.index);
      const linkedHome = /<a\b[^>]*href=["'](?:\/|\.\/|https?:\/\/[^"']*\/)["'][^>]*>\s*(?:<[^>]+>\s*)*$/i.test(before);
      const hinted = LOGO_HINT.test(hints) || LOGO_HINT.test(before.slice(before.lastIndexOf("<a")));
      if (!hinted && !(linkedHome && inHeader(m.index))) continue;
      if (NOT_LOGO_HINT.test(hints)) continue;
      let score = hinted ? 70 : 55;
      if (inHeader(m.index)) score += 15;
      if (inFooter(m.index)) score -= 30;
      if (/\.svg(\?|$)/i.test(src)) score += 10;
      logos.push({ kind: "url", url: src, score });
    }
  }

  for (const url of jsonLdLogos(head, base)) logos.push({ kind: "url", url, score: 88 });
  logos.push(...inlineSvgLogos(head, inHeader, inFooter));
  const ogLogo = absolute(meta.get("og:logo"), base);
  if (ogLogo) logos.push({ kind: "url", url: ogLogo, score: 80 });
  logos.push(...icons);
  const ogImage = absolute(meta.get("og:image"), base);
  if (ogImage) logos.push({ kind: "url", url: ogImage, score: 10 });

  const seen = new Set<string>();
  const ranked = logos
    .sort((a, b) => b.score - a.score)
    .filter((logo) => {
      const key = logo.kind === "url" ? logo.url : logo.markup.slice(0, 500);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const inlineCss = [...head.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((m) => m[1] ?? "")
    .join("\n")
    .slice(0, 300_000);
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? "").trim();

  return {
    title,
    description: meta.get("description") ?? meta.get("og:description") ?? "",
    siteName: meta.get("og:site_name") ?? meta.get("application-name") ?? "",
    themeColor: meta.get("theme-color") ?? null,
    logos: ranked,
    stylesheets: stylesheets.slice(0, MAX_STYLESHEETS),
    inlineCss,
    googleFonts: [...new Set(googleFonts)],
    text: visibleText(head),
  };
}
