/**
 * Körs i den renderade sidan via `page.evaluate`. Funktionerna serialiseras
 * som text, så de får inte använda något utanför sin egen kropp.
 */

export interface CollectedLogo {
  index: number;
  kind: "img" | "svg" | "background";
  src: string;
  score: number;
  /** Inline-SVG med `<text>` renderas fel utan sidans typsnitt — då tas skärmdump. */
  svgHasText: boolean;
}

export interface CollectedFont {
  /** Den beräknade `font-family`-listan, t.ex. `"Oswald", sans-serif`. */
  stack: string;
  weight: number;
  /** Textbredd jämfört med Arial i samma vikt; Arial Narrow ≈ 0,82. */
  widthRatio: number;
  heading: number;
  nav: number;
  button: number;
  body: number;
}

export interface CollectedColor {
  color: string;
  weight: number;
}

export interface CollectedPage {
  title: string;
  description: string;
  siteName: string;
  themeColor: string;
  headings: string[];
  nav: string[];
  text: string;
  ldLogo: string;
  logos: CollectedLogo[];
  fonts: CollectedFont[];
  colors: CollectedColor[];
  links: string[];
}

export const LOGO_ATTRIBUTE = "data-brand-logo";

/** Döljer cookie-rutor och helsidesöverlägg som annars hamnar i skärmdumparna. */
export function dismissOverlays(): number {
  const CONSENT = /cookie|consent|gdpr|onetrust|cookiebot|cybot|didomi|usercentrics|coi-|cmp|qc-cmp|truste|iubenda|klaro/i;
  let hidden = 0;
  const area = innerWidth * innerHeight;
  document.querySelectorAll<HTMLElement>("body *").forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.position !== "fixed" && cs.position !== "sticky") return;
    if (el.closest("header, [role=banner]") && !CONSENT.test(`${el.id} ${el.className}`)) return;
    const r = el.getBoundingClientRect();
    const covers = (r.width * r.height) / area;
    const consent = CONSENT.test(`${el.id} ${typeof el.className === "string" ? el.className : ""} ${el.getAttribute("aria-label") ?? ""}`);
    if (consent || (covers > 0.3 && Number(cs.zIndex) > 10)) {
      el.style.setProperty("display", "none", "important");
      hidden++;
    }
  });
  for (const root of [document.documentElement, document.body]) {
    root.style.setProperty("overflow", "auto", "important");
  }
  return hidden;
}

export async function collectPage(attribute: string): Promise<CollectedPage> {
  const meta = (k: string) =>
    (document.querySelector(`meta[property="${k}"], meta[name="${k}"]`) as HTMLMetaElement | null)?.content?.trim() ?? "";
  const clean = (s: string | null | undefined, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const visible = (e: Element) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const host = location.hostname.replace(/^www\./, "");
  const largest = (srcset: string) =>
    srcset
      .split(",")
      .map((s) => s.trim().split(/\s+/))
      .filter((p) => p[0])
      .sort((a, b) => parseFloat(b[1] ?? "0") - parseFloat(a[1] ?? "0"))[0]?.[0] ?? "";

  const headingEls = [...document.querySelectorAll("h1, h2, h3")].filter(visible);
  const headings = headingEls.map((h) => clean(h.textContent, 120)).filter(Boolean).slice(0, 24);
  const navEls = [...document.querySelectorAll("header a, nav a, [role=navigation] a")].filter(visible);
  const nav = [...new Set(navEls.map((a) => clean(a.textContent, 40)).filter((t) => t.length > 1))].slice(0, 30);

  let ldLogo = "";
  const walk = (v: unknown, depth: number): void => {
    if (!v || typeof v !== "object" || depth > 6 || ldLogo) return;
    if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
    const o = v as Record<string, unknown>;
    const type = String(o["@type"] ?? "");
    const first = (x: unknown): string =>
      typeof x === "string" ? x : Array.isArray(x) ? first(x[0]) : x && typeof x === "object" ? first((x as Record<string, unknown>).url) : "";
    if (/Organization|Corporation|Brand|LocalBusiness|Store|Dentist|Hotel|Restaurant|MedicalBusiness/i.test(type) && o.logo) {
      ldLogo = first(o.logo);
      return;
    }
    Object.values(o).forEach((x) => walk(x, depth + 1));
  };
  document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try {
      walk(JSON.parse(s.textContent ?? ""), 0);
    } catch {
      // Trasig JSON-LD är vanligt.
    }
  });

  const brandPhrases = [meta("og:site_name"), document.title.split(/[|–—:-]/)[0] ?? "", host.split(".")[0] ?? ""];
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9åäö]/g, "");
  const brandWords = [
    ...brandPhrases.map(squash).filter((s) => s.length >= 3),
    ...brandPhrases.flatMap((s) => s.split(/[\s-]+/)).map(squash).filter((s) => s.length >= 4),
  ];
  const NEVER_LOGO = /flag|lang|locale|country|language|sprak|språk|cart|varukorg|social|facebook|instagram|linkedin|payment|klarna|swish|trustpilot|partner|certif|award/;
  // "logoIcon", "brand-icon" — ord som bara är misstänkta när loggan inte nämns.
  const UI_ELEMENT = /user|account|search|menu|meny|hamburger|lucide|icon/;
  const logos: (CollectedLogo & { el: Element })[] = [];
  const consider = (el: Element, kind: CollectedLogo["kind"], src: string) => {
    const r = el.getBoundingClientRect();
    if (!visible(el) || r.top + scrollY > 260 || r.width < 16 || r.height < 10 || r.width > 520 || r.height > 220) return;
    const link = el.closest("a");
    let home = false;
    try {
      const u = new URL(link?.getAttribute("href") ?? "", location.href);
      home = Boolean(link) && u.hostname.replace(/^www\./, "") === host && u.pathname.split("/").filter(Boolean).length <= 1;
    } catch {
      // Ogiltig länk räknas inte som hemlänk.
    }
    const hay = [el, el.parentElement, link]
      .map((e) =>
        e
          ? `${e.getAttribute("class") ?? ""} ${e.id} ${e.getAttribute("alt") ?? ""} ${e.getAttribute("aria-label") ?? ""} ${e.getAttribute("title") ?? ""} ${e.getAttribute("src") ?? ""}`
          : "",
      )
      .join(" ")
      .toLowerCase();
    const flat = hay.replace(/[^a-z0-9åäö]/g, "");
    let score = 0;
    const named = /logo|brand/.test(hay);
    if (named) score += 40;
    if (brandWords.some((w) => flat.includes(w))) score += 35;
    if (home) score += 25;
    if (el.closest("header, nav, [role=banner]")) score += 10;
    if (NEVER_LOGO.test(hay) || (!named && UI_ELEMENT.test(hay))) score -= 60;
    if (r.width < 28 && r.height < 28) score -= 25;
    if (score < 20) return;
    logos.push({ index: -1, kind, src, score, svgHasText: kind === "svg" && el.querySelector("text") !== null, el });
  };
  document.querySelectorAll("img, svg").forEach((el) => {
    if (el.parentElement?.closest("svg")) return;
    const src = el instanceof HTMLImageElement ? largest(el.getAttribute("srcset") ?? "") || el.currentSrc || el.src : "";
    consider(el, el instanceof HTMLImageElement ? "img" : "svg", src);
  });
  document.querySelectorAll('[class*="logo" i], [id*="logo" i]').forEach((el) => {
    if (el.querySelector("img, svg")) return;
    const bg = getComputedStyle(el).backgroundImage;
    const m = bg && bg !== "none" ? /url\(["']?([^"')]+)["']?\)/.exec(bg) : null;
    if (m?.[1]) consider(el, "background", m[1]);
  });
  const ranked = logos.sort((a, b) => b.score - a.score).slice(0, 4);
  ranked.forEach((l, i) => {
    l.index = i;
    l.el.setAttribute(attribute, String(i));
  });

  // Typsnitt: mät hur bred texten blir i sidans typsnitt jämfört med Arial.
  await document.fonts.ready;
  const canvas = document.createElement("canvas").getContext("2d");
  const SAMPLE = "Anna Lindqvist Receptionen 0123";
  const STRETCH: [number, string][] = [
    [56, "ultra-condensed"],
    [69, "extra-condensed"],
    [81, "condensed"],
    [94, "semi-condensed"],
    [106, "normal"],
    [119, "semi-expanded"],
    [137, "expanded"],
    [175, "extra-expanded"],
  ];
  const stretchKeyword = (value: string) => {
    const pct = parseFloat(value);
    if (Number.isNaN(pct)) return value || "normal";
    return STRETCH.find(([limit]) => pct < limit)?.[1] ?? "ultra-expanded";
  };
  const measure = (stack: string, weight: string, style: string, stretch: string) => {
    if (!canvas) return 1;
    canvas.fontStretch = "normal";
    canvas.font = `${style} ${weight} 48px Arial, "Liberation Sans", sans-serif`;
    const arial = canvas.measureText(SAMPLE).width;
    canvas.font = `${style} ${weight} 48px ${stack}`;
    canvas.fontStretch = stretchKeyword(stretch) as CanvasFontStretch;
    const own = canvas.measureText(SAMPLE).width;
    return arial > 0 ? Math.round((own / arial) * 1000) / 1000 : 1;
  };
  const fontGroups = new Map<string, CollectedFont>();
  const sampleFont = (els: Element[], role: "heading" | "nav" | "button" | "body", max: number) => {
    for (const el of els.slice(0, max)) {
      if (!clean(el.textContent, 4)) continue;
      const cs = getComputedStyle(el);
      const key = `${cs.fontFamily}|${cs.fontWeight}|${cs.fontStyle}|${cs.fontStretch}`;
      let group = fontGroups.get(key);
      if (!group) {
        group = {
          stack: cs.fontFamily,
          weight: Number(cs.fontWeight) || 400,
          widthRatio: measure(cs.fontFamily, cs.fontWeight, cs.fontStyle, cs.fontStretch),
          heading: 0,
          nav: 0,
          button: 0,
          body: 0,
        };
        fontGroups.set(key, group);
      }
      group[role]++;
    }
  };
  sampleFont(headingEls, "heading", 10);
  sampleFont(navEls, "nav", 10);
  sampleFont([...document.querySelectorAll('button, a[class*="btn" i], a[class*="button" i]')].filter(visible), "button", 6);
  sampleFont([...document.querySelectorAll("main p, article p, p")].filter(visible), "body", 10);

  // Färger: ytor och text som bär varumärket, vägda efter hur framträdande de är.
  const colors: CollectedColor[] = [];
  const addColor = (color: string, weight: number) => {
    if (color && !/rgba\([^)]*,\s*0\)$|transparent/.test(color)) colors.push({ color, weight });
  };
  const themeColor = meta("theme-color");
  if (themeColor) addColor(themeColor, 10);
  document.querySelectorAll("header, nav, [role=banner]").forEach((el) => {
    if (!visible(el)) return;
    addColor(getComputedStyle(el).backgroundColor, 5);
  });
  [...document.querySelectorAll('button, a[class*="btn" i], a[class*="button" i], [class*="cta" i]')]
    .filter(visible)
    .slice(0, 12)
    .forEach((el) => {
      const cs = getComputedStyle(el);
      addColor(cs.backgroundColor, 4);
      addColor(cs.borderTopColor, 1);
    });
  headingEls.slice(0, 8).forEach((el) => addColor(getComputedStyle(el).color, 2));
  navEls.slice(0, 10).forEach((el) => addColor(getComputedStyle(el).color, 1));
  [...document.querySelectorAll("main a, footer")].filter(visible).slice(0, 20).forEach((el) => {
    const cs = getComputedStyle(el);
    addColor(cs.color, 1);
    addColor(cs.backgroundColor, 2);
  });

  const ABOUT = /om-oss|om_oss|omoss|about|tjanster|tjänster|services|verksamhet|vad-vi-gor|behandling|erbjud|produkter|products|sortiment|meny|menu/i;
  const SKIP = /login|logga|account|konto|cart|kassa|checkout|kontakt|contact|privacy|integritet|cookie|\.(pdf|zip|jpe?g|png)$/i;
  const links = new Set<string>();
  document.querySelectorAll<HTMLAnchorElement>("header a[href], nav a[href], main a[href]").forEach((a) => {
    try {
      const u = new URL(a.href);
      if (u.hostname.replace(/^www\./, "") !== host || u.pathname === location.pathname || !/^https?:$/.test(u.protocol)) return;
      if (SKIP.test(u.pathname) || !ABOUT.test(`${a.textContent ?? ""} ${u.pathname}`)) return;
      u.hash = "";
      links.add(u.toString());
    } catch {
      // Ogiltig länk.
    }
  });

  const main = (document.querySelector("main") ?? document.body) as HTMLElement;
  return {
    title: clean(document.title, 160),
    description: clean(meta("og:description") || meta("description"), 300),
    siteName: clean(meta("og:site_name") || meta("application-name"), 60),
    themeColor,
    headings,
    nav,
    text: clean(main.innerText, 6000),
    ldLogo,
    logos: ranked.map((l) => ({ index: l.index, kind: l.kind, src: l.src, score: l.score, svgHasText: l.svgHasText })),
    fonts: [...fontGroups.values()],
    colors,
    links: [...links].slice(0, 4),
  };
}
