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
