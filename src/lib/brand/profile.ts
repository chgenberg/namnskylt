import "server-only";
import { Resvg } from "@resvg/resvg-js";
import { readBrand, type BrandReading } from "@/lib/ai/brand-vision";
import { describeCompany, openai, type CompanyDescription } from "@/lib/ai/openai";
import { chooseLogo, flagLike, logoPng, previewJpeg } from "./logo-image";
import { isFamilyAlias, matchFont, matchRenderedFont, renderedFamilies, type FontMatch } from "./match";
import { brandColors, fontFamilies, primaryFamily, rankColors } from "./parse-css";
import { parsePage, type LogoCandidate } from "./parse-html";
import { renderSite, type RenderedLogo, type RenderedSite } from "./render";
import { safeFetch } from "./safe-fetch";
import { FetchBlockedError, parsePublicUrl, withWww } from "./url";

export interface BrandProfile {
  url: string;
  siteName: string;
  /** PNG/JPEG/WebP som data-URL — spåras till gravyr i webbläsaren. */
  logo: string | null;
  fonts: string[];
  font: FontMatch;
  colors: string[];
  company: CompanyDescription | null;
  /** `browser` = sidan renderades; `html` = bara källkoden lästes. */
  reader: "browser" | "html";
}

const PAGE_LIMITS = { maxBytes: 2_000_000, timeoutMs: 7_000, accept: "text/html,application/xhtml+xml" };
const CSS_LIMITS = { maxBytes: 1_000_000, timeoutMs: 4_000, accept: "text/css,*/*;q=0.1" };
const LOGO_LIMITS = { maxBytes: 3_000_000, timeoutMs: 5_000, accept: "image/svg+xml,image/*;q=0.9" };
const LOGO_ATTEMPTS = 4;
/** Bredd på en SVG-logga renderad till PNG — gott om pixlar för spårningen. */
const SVG_RASTER_PX = 800;
const RASTER_TYPES = /^image\/(png|jpe?g|webp|gif|avif|x-icon|vnd\.microsoft\.icon)/i;
/** Hela hämtningen ska rymmas i API-routens 60 s. */
const RENDER_BUDGET_MS = 28_000;
const VISION_TIMEOUT_MS = 22_000;
/** Modellens färgval väger mer än alla färgprov ur sidan tillsammans. */
const VISION_COLOR_WEIGHT = 1_000;
const SITE_TEXT_CHARS = 4_000;

function svgToPng(markup: string): Buffer {
  const svg = /xmlns=/.test(markup) ? markup : markup.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return new Resvg(svg, { fitTo: { mode: "width", value: SVG_RASTER_PX }, font: { loadSystemFonts: false } })
    .render()
    .asPng();
}

const dataUrl = (png: Buffer, type = "image/png") => `data:${type};base64,${png.toString("base64")}`;

/** En logga på adressen som PNG. SVG med text kräver sidans typsnitt — `null`, så tar skärmdumpen över. */
async function fetchLogoPng(url: string): Promise<Buffer | null> {
  const response = await safeFetch(url, LOGO_LIMITS);
  const type = response.contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (type === "image/svg+xml" || (/\.svg(\?|$)/i.test(response.url) && !RASTER_TYPES.test(type))) {
    const markup = response.body.toString("utf8");
    return /<text\b/i.test(markup) ? null : svgToPng(markup);
  }
  if (!RASTER_TYPES.test(type)) return null;
  return logoPng(response.body);
}

/** Originalfilen ger skarpast spårning; skärmdumpen fångar inline-SVG och CSS-loggor. */
async function renderedLogoPng(logo: RenderedLogo, base: string): Promise<{ png: Buffer; source: string } | null> {
  if (logo.src && logo.kind !== "svg") {
    const url = new URL(logo.src, base).href;
    const png = await fetchLogoPng(url).catch(() => null);
    if (png) return { png, source: url };
  }
  const png = logo.shot ? await logoPng(logo.shot).catch(() => null) : null;
  return png ? { png, source: "skärmdump av sidhuvudet" } : null;
}

async function logoImages(site: RenderedSite) {
  const found = await Promise.all(site.logos.map((logo) => renderedLogoPng(logo, site.url)));
  const images = found.filter((image) => image !== null);
  if (site.home.ldLogo && images.length < 5) {
    const png = await fetchLogoPng(new URL(site.home.ldLogo, site.url).href).catch(() => null);
    if (png) images.push({ png, source: "strukturerad data" });
  }
  return images;
}

async function readRendered(site: RenderedSite, logos: { png: Buffer }[]): Promise<BrandReading | null> {
  const ai = openai();
  if (!ai) return null;
  const [screenshot, previews] = await Promise.all([
    site.screenshot ? previewJpeg(site.screenshot, 1024, "#FFFFFF").catch(() => null) : Promise.resolve(null),
    Promise.all(logos.map((logo) => previewJpeg(logo.png))),
  ]);
  const { home } = site;
  return readBrand(
    ai,
    {
      url: site.url,
      pages: site.pages,
      title: home.title,
      siteName: home.siteName,
      description: home.description,
      nav: home.nav,
      headings: [...new Set([...home.headings, ...site.extra.flatMap((page) => page.headings)])].slice(0, 40),
      text: [home.text, ...site.extra.map((page) => page.text)].join("\n\n").slice(0, SITE_TEXT_CHARS),
      screenshot,
      logos: previews,
    },
    VISION_TIMEOUT_MS,
  );
}

async function scrapeRendered(rawUrl: string): Promise<BrandProfile | null> {
  const site = await renderSite(rawUrl, RENDER_BUDGET_MS);
  const logos = await logoImages(site);
  if (logos.length === 0 && site.home.text.length < 40) return null;

  const [reading, flags] = await Promise.all([
    readRendered(site, logos),
    Promise.all(logos.map((logo) => flagLike(logo.png).catch(() => true))),
  ]);
  const chosen = chooseLogo(reading ? reading.logo : null, flags);
  const logo = chosen === null ? null : logos[chosen];
  const { home } = site;
  const families = renderedFamilies(home.fonts, primaryFamily);
  const vision = reading?.brandColor ? [{ color: reading.brandColor, weight: VISION_COLOR_WEIGHT }] : [];

  return {
    url: site.url,
    siteName: reading?.name || home.siteName || home.title.split(/[|–—-]/)[0]?.trim() || site.host,
    logo: logo ? dataUrl(logo.png) : null,
    fonts: families.map((f) => f.family).filter((family) => !isFamilyAlias(family)).slice(0, 4),
    font: matchRenderedFont(home.fonts, primaryFamily) ?? matchFont([]),
    colors: rankColors([...vision, ...home.colors]),
    company: reading ? { name: reading.name, industry: reading.industry, workplace: reading.workplace } : null,
    reader: "browser",
  };
}

async function loadLogo(candidate: LogoCandidate): Promise<string | null> {
  if (candidate.kind === "svg") return dataUrl(svgToPng(candidate.markup));
  const response = await safeFetch(candidate.url, LOGO_LIMITS);
  const type = response.contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (type === "image/svg+xml" || (/\.svg(\?|$)/i.test(response.url) && !RASTER_TYPES.test(type))) {
    return dataUrl(svgToPng(response.body.toString("utf8")));
  }
  if (!RASTER_TYPES.test(type)) return null;
  return dataUrl(response.body, type);
}

async function firstLogo(candidates: readonly LogoCandidate[]): Promise<string | null> {
  for (const candidate of candidates.slice(0, LOGO_ATTEMPTS)) {
    const logo = await loadLogo(candidate).catch(() => null);
    if (logo) return logo;
  }
  return null;
}

async function stylesheetText(urls: readonly string[]): Promise<string> {
  const sheets = await Promise.allSettled(urls.map((url) => safeFetch(url, CSS_LIMITS)));
  return sheets
    .map((sheet) => (sheet.status === "fulfilled" ? sheet.value.body.toString("utf8") : ""))
    .join("\n");
}

/** Utan webbläsare: källkoden, stilmallarna och en textfråga om branschen. */
async function scrapeFetched(rawUrl: string): Promise<BrandProfile> {
  const start = parsePublicUrl(rawUrl);
  const www = withWww(start);
  const page = await safeFetch(start, PAGE_LIMITS).catch((error: unknown) => {
    if (!www || error instanceof FetchBlockedError) throw error;
    return safeFetch(www, PAGE_LIMITS);
  });
  if (!/html/i.test(page.contentType)) throw new Error("Adressen är inte en webbsida");
  const signals = parsePage(page.body.toString("utf8"), page.url);
  const ai = openai();

  const [externalCss, logo, company] = await Promise.all([
    stylesheetText(signals.stylesheets),
    firstLogo(signals.logos),
    ai
      ? describeCompany(ai, {
          url: page.url,
          title: signals.title,
          description: signals.description,
          text: signals.text,
        })
      : Promise.resolve(null),
  ]);

  const css = `${signals.inlineCss}\n${externalCss}`;
  const fonts = fontFamilies(css, signals.googleFonts);
  return {
    url: page.url,
    siteName: company?.name || signals.siteName || signals.title.split(/[|–—-]/)[0]?.trim() || new URL(page.url).hostname,
    logo,
    fonts: fonts.slice(0, 4),
    font: matchFont(fonts),
    colors: brandColors(css, signals.themeColor),
    company,
    reader: "html",
  };
}

/**
 * Hela varumärkesprofilen ur en adress. Sidan renderas i en webbläsare när
 * det går; annars, eller om renderingen inte ger något, läses källkoden.
 * Kastar bara om själva sidan inte går att läsa.
 */
export async function scrapeBrand(rawUrl: string): Promise<BrandProfile> {
  try {
    const rendered = await scrapeRendered(rawUrl);
    if (rendered) return rendered;
  } catch (error) {
    if (error instanceof FetchBlockedError) throw error;
    console.warn("Kunde inte rendera sidan, läser källkoden i stället:", error instanceof Error ? error.message : error);
  }
  return scrapeFetched(rawUrl);
}
