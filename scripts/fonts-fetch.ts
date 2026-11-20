/**
 * Hämtar skyltmotorns extra typsnitt från Google Fonts och skriver listan motorn läser.
 *
 *   pnpm fonts:fetch            hämtar det som saknas och skriver om listan
 *   pnpm fonts:fetch --all      hämtar om alla filer
 *
 * Varje familj hämtas som färdiga TTF-filer i normal och, där den finns, fet stil. Filerna
 * läggs oförändrade i `public/fonts/google/`, med familjens licens bredvid i `licenses/`:
 * licenserna (SIL OFL 1.1, Apache 2.0 och Ubuntu Font Licence) tillåter att filerna sprids
 * vidare så länge licensen följer med. Filerna görs aldrig om till delmängder, eftersom en
 * ändrad fil inte alltid får bära typsnittets namn.
 *
 * En familj tas bara med när filen går att läsa och har bokstäverna en svensk namnskylt
 * behöver. Listan skrivs till `src/engine/font-list.ts`, som inte ska ändras för hand.
 */
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "opentype.js";

type Category = "sans" | "narrow" | "serif" | "rounded" | "script" | "display" | "mono";

const FAMILIES: Record<Category, string[]> = {
  sans: [
    "Inter", "Open Sans", "Lato", "Montserrat", "Poppins", "Raleway", "Source Sans 3", "Work Sans", "DM Sans",
    "Manrope", "Rubik", "Mulish", "Karla", "Outfit", "Urbanist", "Figtree", "Plus Jakarta Sans", "Lexend",
    "Josefin Sans", "Cabin", "Barlow", "Titillium Web", "Exo 2", "Ubuntu", "PT Sans", "Noto Sans",
    "IBM Plex Sans", "Fira Sans", "Hind", "Heebo", "Assistant", "Kanit", "Oxygen", "Red Hat Display", "Sora",
    "Space Grotesk", "Jost", "Archivo", "Albert Sans", "Public Sans", "Libre Franklin", "Overpass", "Catamaran",
    "Asap", "Signika", "Questrial", "Didact Gothic", "Maven Pro", "Encode Sans", "Alata",
  ],
  narrow: [
    "Oswald", "Barlow Condensed", "Bebas Neue", "Fjalla One", "Archivo Narrow", "PT Sans Narrow", "Saira Condensed",
    "Teko", "Pathway Gothic One", "Antonio", "League Gothic", "Yanone Kaffeesatz", "Sofia Sans Condensed",
    "Asap Condensed", "Fira Sans Condensed", "Economica",
  ],
  serif: [
    "Merriweather", "Playfair Display", "Lora", "PT Serif", "Libre Baskerville", "EB Garamond", "Cormorant Garamond",
    "Crimson Text", "Source Serif 4", "Noto Serif", "Bitter", "Roboto Slab", "Zilla Slab", "Arvo", "Alegreya",
    "Cinzel", "DM Serif Display", "Abril Fatface", "Spectral", "Cardo", "Old Standard TT", "Vollkorn",
    "Frank Ruhl Libre", "IBM Plex Serif", "Domine", "Rokkitt", "Josefin Slab", "Libre Caslon Text", "Prata",
    "Marcellus", "Gilda Display", "Cormorant", "Newsreader", "Fraunces", "Bodoni Moda", "Tinos", "Gelasio",
    "Quattrocento", "Alike", "Rufina",
  ],
  rounded: ["Nunito", "Nunito Sans", "Quicksand", "Varela Round", "Comfortaa", "M PLUS Rounded 1c", "Fredoka", "Baloo 2", "Dosis", "Sniglet"],
  script: [
    "Pacifico", "Dancing Script", "Great Vibes", "Satisfy", "Kaushan Script", "Lobster", "Lobster Two", "Sacramento",
    "Caveat", "Courgette", "Cookie", "Allura", "Parisienne", "Yellowtail", "Shadows Into Light", "Indie Flower",
    "Permanent Marker", "Amatic SC", "Kalam", "Patrick Hand", "Handlee", "Tangerine", "Alex Brush", "Pinyon Script",
    "Italianno", "Marck Script", "Homemade Apple", "Gloria Hallelujah", "Architects Daughter", "Playball",
    "Norican", "Mr Dafoe", "Damion", "Niconne", "Merienda",
  ],
  display: [
    "Anton", "Righteous", "Alfa Slab One", "Bangers", "Russo One", "Staatliches", "Audiowide", "Orbitron",
    "Special Elite", "Black Ops One", "Passion One", "Lilita One", "Luckiest Guy", "Titan One", "Paytone One",
    "Secular One", "Carter One", "Chewy", "Poiret One", "Limelight", "Bungee", "Michroma", "Syncopate", "Unbounded",
  ],
  mono: [
    "Roboto Mono", "Source Code Pro", "IBM Plex Mono", "Space Mono", "JetBrains Mono", "Courier Prime", "Inconsolata",
    "Fira Mono", "Ubuntu Mono", "Share Tech Mono", "DM Mono", "Overpass Mono",
  ],
};

/** Bokstäverna en svensk, norsk, dansk eller finsk namnskylt behöver, utöver A–Z och siffror. */
const REQUIRED = "AaZz09ÅÄÖåäöÆØæøÉéÜü&-.,@";
const OUT_DIR = path.join(process.cwd(), "public", "fonts", "google");
const LICENSE_DIR = path.join(OUT_DIR, "licenses");
const LIST_FILE = path.join(process.cwd(), "src", "engine", "font-list.ts");
/** En gammal webbläsare får färdiga TTF-filer i stället för WOFF2 i delar. */
const LEGACY_AGENT = "Mozilla/4.0";

const idOf = (family: string) => family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const fileBase = (family: string) => family.replace(/[^A-Za-z0-9]+/g, "");
const exists = (file: string) => stat(file).then(() => true, () => false);

async function get(url: string, agent = "namnskylt-fonts"): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, { headers: { "user-agent": agent }, signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      if (attempt >= 2) throw error;
    }
  }
}

/** Adresserna till familjens TTF-filer i vikt 400 och 700. En vikt familjen saknar finns inte med. */
async function ttfUrls(family: string): Promise<{ regular?: string; bold?: string }> {
  const css = await get(`https://fonts.googleapis.com/css?family=${encodeURIComponent(family)}:400,700`, LEGACY_AGENT).then((r) => (r.ok ? r.text() : ""));
  const urls: { regular?: string; bold?: string } = {};
  for (const block of css.split("@font-face").slice(1)) {
    if (!/font-style:\s*normal/.test(block)) continue;
    const url = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/.exec(block)?.[1];
    const weight = /font-weight:\s*(\d+)/.exec(block)?.[1];
    if (url && weight === "400") urls.regular = url;
    if (url && weight === "700") urls.bold = url;
  }
  return urls;
}

/** Skälet till att filen inte duger, eller `null` när den gör det. */
function fontIssue(buffer: ArrayBuffer): string | null {
  try {
    const font = parse(buffer);
    for (const char of REQUIRED) if (font.charToGlyphIndex(char) === 0) return `saknar ${char}`;
    const cap = font.charToGlyph("H").getBoundingBox().y2 / font.unitsPerEm;
    if (!(cap > 0.3 && cap < 1.2)) return `orimlig versalhöjd (${cap.toFixed(2)})`;
    // Glyf för glyf, som motorn ritar när typsnittets egna regler för sammansatta tecken inte går att läsa.
    for (const char of "ÅäÖg8") if (font.charToGlyph(char).getPath(0, 0, 10).commands.length < 4) return `ritar inte ${char}`;
    return null;
  } catch (error) {
    return `går inte att läsa (${error instanceof Error ? error.message.slice(0, 60) : "okänt fel"})`;
  }
}

async function download(url: string, file: string, force: boolean): Promise<ArrayBuffer> {
  if (!force && (await exists(file))) {
    const data = await readFile(file);
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  }
  const response = await get(url);
  if (!response.ok) throw new Error(`${response.status} för ${url}`);
  const buffer = await response.arrayBuffer();
  await writeFile(file, Buffer.from(buffer));
  return buffer;
}

/** Familjens licens ur Google Fonts eget arkiv. Svarar med licensens namn, eller `null` när den inte hittas. */
async function license(family: string, id: string, force: boolean): Promise<string | null> {
  const target = path.join(LICENSE_DIR, `${id}.txt`);
  const names: Record<string, string> = { ofl: "SIL Open Font License 1.1", apache: "Apache License 2.0", ufl: "Ubuntu Font Licence 1.0" };
  const kindOf = (text: string) => (/SIL OPEN FONT LICENSE/i.test(text) ? "ofl" : /Apache License/i.test(text) ? "apache" : /UBUNTU FONT LICENCE/i.test(text) ? "ufl" : null);
  if (!force && (await exists(target))) {
    const kind = kindOf(await readFile(target, "utf8"));
    if (kind) return names[kind]!;
  }
  const dir = family.toLowerCase().replace(/[^a-z0-9]+/g, "");
  for (const [kind, file] of [["ofl", "OFL.txt"], ["apache", "LICENSE.txt"], ["ufl", "UFL.txt"]] as const) {
    const response = await get(`https://raw.githubusercontent.com/google/fonts/main/${kind}/${dir}/${file}`);
    if (!response.ok) continue;
    const text = await response.text();
    if (kindOf(text) !== kind) continue;
    await writeFile(target, text);
    return names[kind]!;
  }
  return null;
}

interface Entry {
  id: string;
  name: string;
  category: Category;
  regular: string;
  bold: string | null;
  license: string;
}

async function main() {
  const force = process.argv.includes("--all");
  await mkdir(LICENSE_DIR, { recursive: true });
  const entries: Entry[] = [];
  const skipped: string[] = [];
  const jobs = Object.entries(FAMILIES).flatMap(([category, families]) => families.map((family) => ({ family, category: category as Category })));

  const work = async ({ family, category }: (typeof jobs)[number]) => {
    const id = idOf(family);
    try {
      const urls = await ttfUrls(family);
      if (!urls.regular) return void skipped.push(`${family}: ingen normal stil`);
      const regular = `${fileBase(family)}-Regular.ttf`;
      const issue = fontIssue(await download(urls.regular, path.join(OUT_DIR, regular), force));
      if (issue) return void skipped.push(`${family}: ${issue}`);
      let bold: string | null = null;
      if (urls.bold) {
        const file = `${fileBase(family)}-Bold.ttf`;
        if (!fontIssue(await download(urls.bold, path.join(OUT_DIR, file), force))) bold = file;
      }
      const licenseName = await license(family, id, force);
      if (!licenseName) return void skipped.push(`${family}: licensen hittades inte`);
      entries.push({ id, name: family, category, regular, bold, license: licenseName });
    } catch (error) {
      skipped.push(`${family}: ${error instanceof Error ? error.message.slice(0, 80) : "okänt fel"}`);
    }
  };
  // Sex i taget: lagom för att inte bli strypt.
  const queue = [...jobs];
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) await work(job);
  }));

  const order = Object.keys(FAMILIES);
  entries.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || a.name.localeCompare(b.name, "sv"));
  const lines = entries.map(
    (e) => `  { id: ${JSON.stringify(e.id)}, name: ${JSON.stringify(e.name)}, category: ${JSON.stringify(e.category)}, regular: ${JSON.stringify(e.regular)}, bold: ${JSON.stringify(e.bold)} },`,
  );
  await writeFile(
    LIST_FILE,
    `// Skriven av \`pnpm fonts:fetch\` (scripts/fonts-fetch.ts). Ändra inte för hand: lägg till familjen i skriptet och kör det.\n\n` +
      `/** De extra typsnitten, hämtade från Google Fonts. Filerna ligger i \`public/fonts/google/\`, med licenserna bredvid. */\n` +
      `export const EXTRA_FONTS = [\n${lines.join("\n")}\n] as const;\n`,
  );
  const notice = entries.map((e) => `${e.name} — ${e.license} (licenses/${e.id}.txt)`).join("\n");
  await writeFile(
    path.join(OUT_DIR, "LICENSES.txt"),
    `Typsnitten i den här mappen är hämtade oförändrade från Google Fonts (fonts.google.com).\n` +
      `Varje familj sprids under sin egen licens, som ligger i mappen licenses/.\n\n${notice}\n`,
  );
  // Filer som inte hör till någon familj i listan tas bort: en familj som föll bort, eller en som strukits.
  const kept = new Set(entries.flatMap((e) => [e.regular, ...(e.bold ? [e.bold] : [])]));
  for (const file of await readdir(OUT_DIR)) if (file.endsWith(".ttf") && !kept.has(file)) await rm(path.join(OUT_DIR, file));
  const licenses = new Set(entries.map((e) => `${e.id}.txt`));
  for (const file of await readdir(LICENSE_DIR)) if (!licenses.has(file)) await rm(path.join(LICENSE_DIR, file));
  console.log(`${entries.length} familjer, ${entries.filter((e) => e.bold).length} med fet stil.`);
  if (skipped.length > 0) console.log(`Hoppade över ${skipped.length}:\n  ${skipped.join("\n  ")}`);
}

void main();
