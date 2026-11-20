import type { RgbaPixels } from "./logo";
import { edgeColor, edgePixels } from "./pixel-background";

/**
 * En logga i färg trycks som den är i filen, i stället för att graveras i en
 * färg. Här avgörs om en uppladdad bild är i färg, och bilden görs redo att
 * tryckas: en vit botten tas bort så att bara loggan blir kvar, och bilden
 * beskärs till det som syns. Allt annat i bilden lämnas orört.
 */

/** Andel genomskinliga pixlar som gör att bilden redan har en frilagd logga. */
const TRANSPARENT_SHARE = 0.02;
/** Från den här täckningen räknas en pixel som synlig. */
const VISIBLE_ALPHA = 128;
/**
 * Så stor skillnad mellan starkaste och svagaste kanal har en pixel i färg.
 * Under det är den svart, vit eller grå.
 */
const MIN_CHROMA = 48;
/** Andel av loggans pixlar som måste ha färg. Under det är det kantbrus i en svartvit logga. */
const MIN_COLOR_SHARE = 0.01;
/** Lägsta kanalvärde för att kantens färg ska räknas som vit botten. */
const WHITE_FLOOR = 235;
/** Så stor del av bildens kant måste vara botten. Annars är bilden heltäckande och lämnas som den är. */
const MIN_EDGE_SHARE = 0.7;
/** Så nära bottnens färg (per kanal) är en pixel helt botten … */
const KEY_LOW = 10;
/** … och så långt ifrån är den helt logga. Däremellan tonas kanten ut. */
const KEY_HIGH = 40;

/** RGBA-pixlar i en egen buffert, redo att skrivas till en bild. */
export interface LogoPixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

type Rgb = readonly [number, number, number];

function distanceTo(data: ArrayLike<number>, i: number, [r, g, b]: Rgb): number {
  return Math.max(Math.abs((data[i * 4] ?? 0) - r), Math.abs((data[i * 4 + 1] ?? 0) - g), Math.abs((data[i * 4 + 2] ?? 0) - b));
}

/**
 * Bottnens färg när bilden har en vit botten att ta bort: ingen
 * genomskinlighet, vit kant och kanten nästan helt i den färgen. Annars `null`.
 */
function whiteBackground(pixels: RgbaPixels): Rgb | null {
  const { data, width, height } = pixels;
  const count = width * height;
  let transparent = 0;
  for (let i = 0; i < count; i++) if ((data[i * 4 + 3] ?? 0) < VISIBLE_ALPHA) transparent++;
  if (transparent / count > TRANSPARENT_SHARE) return null;

  const background = edgeColor(pixels);
  if (Math.min(...background) < WHITE_FLOOR) return null;
  let edge = 0;
  let matching = 0;
  for (const i of edgePixels(width, height)) {
    edge++;
    if (distanceTo(data, i, background) <= KEY_LOW) matching++;
  }
  return matching / edge >= MIN_EDGE_SHARE ? background : null;
}

/**
 * Bilden med den vita bottnen borttagen. En pixel mellan botten och logga
 * (en utjämnad kant) blir halvgenomskinlig och får färgen den hade före
 * blandningen med bottnen, så att loggan inte får en vit rand på en färgad
 * skylt. En bild som redan är frilagd, eller saknar vit botten, kopieras orörd.
 */
export function withoutWhiteBackground(pixels: RgbaPixels): LogoPixels {
  const { data, width, height } = pixels;
  const out = Uint8ClampedArray.from(data);
  const background = whiteBackground(pixels);
  if (!background) return { data: out, width, height };

  for (let i = 0; i < width * height; i++) {
    const distance = distanceTo(data, i, background);
    if (distance >= KEY_HIGH) continue;
    const cover = Math.max(0, (distance - KEY_LOW) / (KEY_HIGH - KEY_LOW));
    out[i * 4 + 3] = Math.round((data[i * 4 + 3] ?? 0) * cover);
    if (cover === 0) continue;
    for (let channel = 0; channel < 3; channel++) {
      const mixed = data[i * 4 + channel] ?? 0;
      const base = background[channel] ?? 255;
      out[i * 4 + channel] = Math.round(base + (mixed - base) / cover);
    }
  }
  return { data: out, width, height };
}

/** Om det som syns i bilden är i färg, alltså mer än svart, vitt och grått. */
export function hasColor({ data, width, height }: RgbaPixels): boolean {
  let visible = 0;
  let colored = 0;
  for (let i = 0; i < width * height; i++) {
    if ((data[i * 4 + 3] ?? 0) < VISIBLE_ALPHA) continue;
    visible++;
    const r = data[i * 4] ?? 0;
    const g = data[i * 4 + 1] ?? 0;
    const b = data[i * 4 + 2] ?? 0;
    if (Math.max(r, g, b) - Math.min(r, g, b) >= MIN_CHROMA) colored++;
  }
  return visible > 0 && colored >= Math.max(1, visible * MIN_COLOR_SHARE);
}

/** Det som syns i bilden som mask (1 = synligt), för att spåra loggans siluett. */
export function visibleMask({ data, width, height }: RgbaPixels): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = (data[i * 4 + 3] ?? 0) >= VISIBLE_ALPHA ? 1 : 0;
  return mask;
}

/** Bilden beskuren till det som syns, med en pixels marginal för utjämnade kanter. `null` = inget syns. */
function cropToVisible({ data, width, height }: LogoPixels): LogoPixels | null {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) < VISIBLE_ALPHA) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < 0) return null;
  left = Math.max(0, left - 1);
  top = Math.max(0, top - 1);
  right = Math.min(width - 1, right + 1);
  bottom = Math.min(height - 1, bottom + 1);

  const croppedWidth = right - left + 1;
  const croppedHeight = bottom - top + 1;
  const cropped = new Uint8ClampedArray(croppedWidth * croppedHeight * 4);
  for (let y = 0; y < croppedHeight; y++) {
    const start = ((top + y) * width + left) * 4;
    cropped.set(data.subarray(start, start + croppedWidth * 4), y * croppedWidth * 4);
  }
  return { data: cropped, width: croppedWidth, height: croppedHeight };
}

/**
 * Loggan i färg ur en uppladdad bild: vit botten borttagen och beskuren till
 * det som syns. `null` när bilden är svartvit — då graveras loggan i stället.
 */
export function colorLogo(pixels: RgbaPixels): LogoPixels | null {
  const cleared = withoutWhiteBackground(pixels);
  if (!hasColor(cleared)) return null;
  return cropToVisible(cleared);
}

/** Så nära varandra (per kanal, i snitt) räknas två färger i loggan som samma. */
const SAME_COLOR_DISTANCE = 36;
/** En färg som täcker mindre än så av loggan är en kant eller en detalj, ingen av loggans färger. */
const MIN_PALETTE_SHARE = 0.05;
/** Så lik sina grannar (per kanal, i snitt) är en pixel i en fylld yta. Kantens blandfärger är det inte. */
const FLAT_DISTANCE = 12;
/** Har loggan mindre fylld yta än så (tunna linjer) räknas alla pixlar, och blandfärgerna sorteras bort efteråt. */
const MIN_FLAT_SHARE = 0.1;
/** Så nära linjen mellan en av loggans färger och bottnen (per kanal, i snitt) ligger en blandfärg i kanten. */
const BLEND_DISTANCE = 16;

/** Så många av loggans färger läses av och sparas med skylten. */
export const LOGO_COLORS_MAX = 4;

const WHITE: Rgb = [255, 255, 255];

interface ColorGroup {
  count: number;
  r: number;
  g: number;
  b: number;
}

const meanOf = (group: ColorGroup): Rgb => [group.r / group.count, group.g / group.count, group.b / group.count];
const apart = (a: Rgb, b: Rgb) => (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3;

/** Ligger färgen mellan `color` och `backdrop`? Så ser kantutjämningen ut: loggans färg blandad med bottnen. */
function isBlend(candidate: Rgb, color: Rgb, backdrop: Rgb): boolean {
  const axis = [backdrop[0] - color[0], backdrop[1] - color[1], backdrop[2] - color[2]] as const;
  const length = axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2;
  // Färgen är själv bottnens: då går det inte att säga vad som är en blandning.
  if (length < 30 ** 2) return false;
  const share =
    ((candidate[0] - color[0]) * axis[0] + (candidate[1] - color[1]) * axis[1] + (candidate[2] - color[2]) * axis[2]) / length;
  if (share <= 0 || share >= 1) return false;
  const onLine: Rgb = [color[0] + axis[0] * share, color[1] + axis[1] * share, color[2] + axis[2] * share];
  return apart(candidate, onLine) < BLEND_DISTANCE;
}

/**
 * Färgerna i det som syns, den som täcker mest först. Bara fyllda ytor räknas: en pixel i
 * kanten är loggans färg blandad med bottnen, och i en logga med tunna linjer är kanten en
 * stor del av bilden. Utan det lästes en röd logga på vit botten som rött och två rosa.
 * Har loggan nästan ingen fylld yta räknas alla pixlar, och det som ligger mellan en större
 * färg och `backdrop` tas bort.
 */
function paletteOf({ data, width, height }: RgbaPixels, max: number, backdrop: Rgb): string[] {
  const visibleAt = (i: number) => (data[i * 4 + 3] ?? 0) >= VISIBLE_ALPHA;
  const alike = (i: number, j: number) =>
    (Math.abs((data[i * 4] ?? 0) - (data[j * 4] ?? 0)) +
      Math.abs((data[i * 4 + 1] ?? 0) - (data[j * 4 + 1] ?? 0)) +
      Math.abs((data[i * 4 + 2] ?? 0) - (data[j * 4 + 2] ?? 0))) /
      3 <
    FLAT_DISTANCE;
  const filledAt = (x: number, y: number, i: number) =>
    (x === 0 || (visibleAt(i - 1) && alike(i, i - 1))) &&
    (x === width - 1 || (visibleAt(i + 1) && alike(i, i + 1))) &&
    (y === 0 || (visibleAt(i - width) && alike(i, i - width))) &&
    (y === height - 1 || (visibleAt(i + width) && alike(i, i + width)));

  // Grov indelning först: 16 steg per kanal räcker för att skilja en loggas färger åt.
  const all = new Map<number, ColorGroup>();
  const filled = new Map<number, ColorGroup>();
  const counts = { all: 0, filled: 0 };
  const add = (buckets: Map<number, ColorGroup>, r: number, g: number, b: number) => {
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!visibleAt(i)) continue;
      const r = data[i * 4] ?? 0;
      const g = data[i * 4 + 1] ?? 0;
      const b = data[i * 4 + 2] ?? 0;
      counts.all++;
      add(all, r, g, b);
      if (!filledAt(x, y, i)) continue;
      counts.filled++;
      add(filled, r, g, b);
    }
  }
  if (counts.all === 0) return [];
  const solid = counts.filled >= counts.all * MIN_FLAT_SHARE;
  const total = solid ? counts.filled : counts.all;

  // Sedan slås grannar ihop, störst först, så att varje färg i loggan blir en.
  const groups: ColorGroup[] = [];
  for (const bucket of [...(solid ? filled : all).values()].sort((a, b) => b.count - a.count)) {
    const near = groups.find((group) => apart(meanOf(group), meanOf(bucket)) < SAME_COLOR_DISTANCE);
    if (near) {
      near.count += bucket.count;
      near.r += bucket.r;
      near.g += bucket.g;
      near.b += bucket.b;
    } else {
      groups.push({ ...bucket });
    }
  }
  const listed = groups.filter((group) => group.count >= total * MIN_PALETTE_SHARE);
  const kept: ColorGroup[] = [];
  // Blandfärgernas yta per färg. Den räknas för sig, så att färgens kod inte dras mot blandfärgen.
  const blended = new Map<ColorGroup, number>();
  if (solid) {
    kept.push(...listed);
  } else {
    // Utan fyllda ytor att gå på: det som ligger mellan en renare färg och bottnen är kantens
    // blandfärg. Den renaste prövas först, och blandfärgens yta räknas till färgen den hör till.
    for (const group of listed.sort((a, b) => apart(meanOf(b), backdrop) - apart(meanOf(a), backdrop))) {
      const pure = kept.find((color) => isBlend(meanOf(group), meanOf(color), backdrop));
      if (pure) blended.set(pure, (blended.get(pure) ?? 0) + group.count);
      else kept.push(group);
    }
  }
  const area = (group: ColorGroup) => group.count + (blended.get(group) ?? 0);
  const hex = (value: number) => Math.round(value).toString(16).padStart(2, "0");
  return kept
    .sort((a, b) => area(b) - area(a))
    .slice(0, max)
    .map((group) => `#${meanOf(group).map(hex).join("")}`.toUpperCase());
}

/**
 * Loggans färger som `#RRGGBB`, den som täcker mest först (besked av ägaren 2026-11-19:
 * systemet ska läsa av loggans färger när en logga läggs in). Bara det som syns räknas.
 * Nyanser som ligger nära varandra slås ihop, så att en toning inte blir många färger,
 * kantens blandfärger räknas inte, och färger som bara täcker en liten del tas inte med.
 * Bilden är en logga i färg, där en vit botten redan är borttagen.
 */
export function logoPalette(pixels: RgbaPixels, max = LOGO_COLORS_MAX): string[] {
  return paletteOf(pixels, max, WHITE);
}

/**
 * Färgerna i det som är bläck i en logga som spåras i en färg: `mask` pekar ut bläcket
 * (1 = bläck), och bottnen räknas inte. En röd logga på vit botten ger alltså sin röda färg.
 */
export function inkPalette({ data, width, height }: RgbaPixels, mask: ArrayLike<number>, max = LOGO_COLORS_MAX): string[] {
  const ink = new Uint8ClampedArray(width * height * 4);
  // Bottnen är det som syns men inte är bläck. Mot den blandas bläcket i kanten.
  const ground = { count: 0, r: 0, g: 0, b: 0 };
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4] ?? 0;
    const g = data[i * 4 + 1] ?? 0;
    const b = data[i * 4 + 2] ?? 0;
    ink[i * 4] = r;
    ink[i * 4 + 1] = g;
    ink[i * 4 + 2] = b;
    ink[i * 4 + 3] = mask[i] ? 255 : 0;
    if (mask[i] || (data[i * 4 + 3] ?? 0) < VISIBLE_ALPHA) continue;
    ground.count++;
    ground.r += r;
    ground.g += g;
    ground.b += b;
  }
  return paletteOf({ data: ink, width, height }, max, ground.count > 0 ? meanOf(ground) : WHITE);
}

/**
 * Loggans färger som de sparas: skärmfärger i versaler, utan dubbletter och högst
 * `LOGO_COLORS_MAX`. Det som inte är en färg tas bort, så att en halvskriven kod aldrig sparas.
 */
export function cleanLogoColors(colors: readonly string[]): string[] {
  const kept: string[] = [];
  for (const color of colors) {
    const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
    const hex = match ? `#${match[1]!.toUpperCase()}` : null;
    if (hex && !kept.includes(hex)) kept.push(hex);
  }
  return kept.slice(0, LOGO_COLORS_MAX);
}

/**
 * Loggans färger efter att kunden har ändrat dem. Färgerna som lästes av från början sparas vid
 * den första ändringen (`readColors`), så att de går att återställa. Är färgerna tillbaka på de
 * avlästa finns inget att återställa, och fältet tas bort.
 */
export function withLogoColors<T extends { colors?: string[]; readColors?: string[] }>(logo: T, colors: readonly string[]): T {
  const next = cleanLogoColors(colors);
  const read = logo.readColors ?? logo.colors ?? [];
  const changed = next.length !== read.length || next.some((color, index) => color !== read[index]);
  const rest = { ...logo };
  delete rest.colors;
  delete rest.readColors;
  return { ...rest, ...(next.length > 0 && { colors: next }), ...(changed && read.length > 0 && { readColors: read }) };
}

