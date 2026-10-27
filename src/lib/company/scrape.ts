import "server-only";
import sharp from "sharp";
import { scrapeBrand } from "@/lib/brand/profile";
import { safeFetch } from "@/lib/brand/safe-fetch";
import { parsePublicUrl } from "@/lib/brand/url";
import { extractContacts, mergeContacts, type FoundContacts } from "./contacts";
import { isHexColor, MAX_LOGO_DATA_URL_CHARS } from "./profile";

/** Det skrapningen hittade. Inget sparas förrän återförsäljaren tryckt Spara. */
export interface CompanyScrape {
  website: string;
  name: string | null;
  tagline: string | null;
  logoOptions: string[];
  colors: string[];
  contacts: FoundContacts;
}

const PAGE_LIMITS = { maxBytes: 2_000_000, timeoutMs: 7_000, accept: "text/html,application/xhtml+xml" };
const CONTACT_LINK = /kontakt|contact|om-oss|about|hitta-hit/i;
const MAX_CONTACT_PAGES = 2;
const LOGO_MAX_WIDTH_PX = 600;
const MAX_LOGO_OPTIONS = 4;

/** Länkar på samma värd som troligen har kontaktuppgifter. */
function contactPages(html: string, base: string): string[] {
  const host = new URL(base).hostname;
  const urls = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const [, href = "", label = ""] = match;
    if (!CONTACT_LINK.test(href) && !CONTACT_LINK.test(label.replace(/<[^>]+>/g, ""))) continue;
    try {
      const url = new URL(href, base);
      if (url.hostname === host && /^https?:$/.test(url.protocol)) urls.add(url.href.split("#")[0] ?? url.href);
    } catch {
      continue;
    }
  }
  return [...urls].slice(0, MAX_CONTACT_PAGES);
}

async function htmlOf(url: string): Promise<{ url: string; html: string } | null> {
  const response = await safeFetch(url, PAGE_LIMITS).catch(() => null);
  return response ? { url: response.url, html: response.body.toString("utf8") } : null;
}

/** Loggan får plats i inställningarna och i PDF:en: smal PNG, annars WebP. */
async function compactLogo(dataUrl: string): Promise<string | null> {
  const base64 = dataUrl.split(",")[1];
  if (!base64) return null;
  const image = sharp(Buffer.from(base64, "base64")).resize({ width: LOGO_MAX_WIDTH_PX, withoutEnlargement: true });
  const png = await image.clone().png({ compressionLevel: 9 }).toBuffer();
  const candidate = `data:image/png;base64,${png.toString("base64")}`;
  if (candidate.length <= MAX_LOGO_DATA_URL_CHARS) return candidate;
  const webp = await image.webp({ quality: 88 }).toBuffer();
  const fallback = `data:image/webp;base64,${webp.toString("base64")}`;
  return fallback.length <= MAX_LOGO_DATA_URL_CHARS ? fallback : null;
}

export async function scrapeCompany(rawUrl: string): Promise<CompanyScrape> {
  const url = parsePublicUrl(rawUrl);
  const [brand, home] = await Promise.all([scrapeBrand(url.href).catch(() => null), htmlOf(url.href)]);
  if (!brand && !home) throw new Error("Sidan gick inte att läsa");

  const extra = home ? await Promise.all(contactPages(home.html, home.url).map(htmlOf)) : [];
  const contacts = mergeContacts(
    ...[home, ...extra].filter((page) => page !== null).map((page) => extractContacts(page.html)),
  );
  const logos = await Promise.all(
    (brand?.logoOptions ?? []).slice(0, MAX_LOGO_OPTIONS).map((logo) => compactLogo(logo).catch(() => null)),
  );

  return {
    website: (home?.url ?? brand?.url ?? url.href).replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""),
    name: brand?.company?.name || brand?.siteName || null,
    tagline: brand?.company?.industry || null,
    logoOptions: logos.filter((logo): logo is string => logo !== null),
    colors: (brand?.colors ?? []).filter(isHexColor).map((c) => c.toLowerCase()),
    contacts,
  };
}
