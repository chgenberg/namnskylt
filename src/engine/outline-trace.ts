import { CUSTOM_SHAPE_LIMITS } from "./catalog";
import { customOutlineIssue, fitOutline, polygonArea, simplifyOutline } from "./custom-outline";
import { signedArea } from "./outline-math";
import { otsuThreshold, traceLogoMask, type RgbaPixels } from "./logo";
import { edgeColor } from "./pixel-background";
import type { Point } from "./shape";
import type { Mm } from "./types";

/**
 * En uppladdad fil blir en egen form: bilden blir en mask (form/botten),
 * masken spåras och den yttre konturen förenklas till en polygon i mm.
 */

/** Andel genomskinliga pixlar som gör att alfakanalen avgör vad som är form. */
const TRANSPARENT_SHARE = 0.02;
const OPAQUE_ALPHA = 128;
/** Så mycket måste en pixel skilja sig från bottnen för att räknas — under det är det JPEG-brus. */
const MIN_BACKGROUND_DISTANCE = 24;
/** Skiljer sig en pixel så här mycket från bottnen är den alltid form, hur mörka figurens övriga delar än är. */
const MAX_BACKGROUND_DISTANCE = 48;
/** En bild med så här lite form är en ritad linje, inte en fylld yta. */
const THIN_INK_SHARE = 0.03;

/** En tunn linje kan hänga ihop bara diagonalt; en pixel bredare blir den en sluten ring. */
function thicken(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      if (x > 0) out[y * width + x - 1] = 1;
      if (x < width - 1) out[y * width + x + 1] = 1;
      if (y > 0) out[(y - 1) * width + x] = 1;
      if (y < height - 1) out[(y + 1) * width + x] = 1;
    }
  }
  return out;
}

/**
 * Form eller botten per pixel. Genomskinlig bild: det som syns är form, även
 * en hårfin linje. Ogenomskinlig: allt som skiljer sig från kantens färg är
 * form, så att en flerfärgad figur på vit botten blir en enda siluett.
 */
export function silhouetteMask(pixels: RgbaPixels): Uint8Array {
  const { data, width, height } = pixels;
  const count = width * height;
  const presence = new Uint8Array(count);
  let transparent = 0;
  for (let i = 0; i < count; i++) if ((data[i * 4 + 3] ?? 0) < OPAQUE_ALPHA) transparent++;

  const byAlpha = transparent / count > TRANSPARENT_SHARE;
  if (byAlpha) {
    for (let i = 0; i < count; i++) presence[i] = data[i * 4 + 3] ?? 0;
  } else {
    const [r, g, b] = edgeColor(pixels);
    for (let i = 0; i < count; i++) {
      const distance = Math.max(
        Math.abs((data[i * 4] ?? 0) - r),
        Math.abs((data[i * 4 + 1] ?? 0) - g),
        Math.abs((data[i * 4 + 2] ?? 0) - b),
      );
      // Enstaka genomskinliga pixlar i en annars täckande bild är botten.
      presence[i] = (distance * (data[i * 4 + 3] ?? 0)) / 255;
    }
  }

  // Otsu delar bilden i två klasser. Har figuren både bleka och mörka delar hamnar gränsen
  // mellan dem, och de bleka skulle bli botten. Taket håller kvar dem som form.
  const otsu = otsuThreshold(presence);
  const threshold = byAlpha
    ? Math.min(otsu, OPAQUE_ALPHA - 1)
    : Math.min(Math.max(otsu, MIN_BACKGROUND_DISTANCE), MAX_BACKGROUND_DISTANCE);
  const mask = new Uint8Array(count);
  let ink = 0;
  for (let i = 0; i < count; i++) {
    if ((presence[i] ?? 0) > threshold) {
      mask[i] = 1;
      ink++;
    }
  }
  return ink > 0 && ink / count < THIN_INK_SHARE ? thicken(mask, width, height) : mask;
}

const PATH_NUMBER = /-?\d+(?:\.\d+)?/g;

/** Delbanan med störst yta i en spårad bana (`M…L…Z` per delbana): figurens ytterkant. */
function largestSubpath(d: string): Point[] {
  let best: Point[] = [];
  let bestArea = 0;
  for (const part of d.split("Z")) {
    const numbers = (part.match(PATH_NUMBER) ?? []).map(Number);
    const points: Point[] = [];
    for (let i = 0; i + 1 < numbers.length; i += 2) points.push({ x: numbers[i] ?? 0, y: numbers[i + 1] ?? 0 });
    const area = polygonArea(points);
    if (points.length >= 3 && area > bestArea) {
      best = points;
      bestArea = area;
    }
  }
  return best;
}

/**
 * Slår ihop grannpunkter som ligger närmare varandra än `minEdgeMm` till en
 * punkt mitt emellan, kortaste kanten först. Spårningen fasar av varje skarpt
 * hörn med en kort kant; här blir det ett hörn igen.
 */
function mergeShortEdges(points: readonly Point[], minEdgeMm: Mm): Point[] {
  const merged = [...points];
  while (merged.length > 3) {
    let shortest = -1;
    let shortestLength = minEdgeMm;
    for (const [i, a] of merged.entries()) {
      const b = merged[(i + 1) % merged.length] ?? a;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length < shortestLength) {
        shortest = i;
        shortestLength = length;
      }
    }
    const a = merged[shortest];
    const next = (shortest + 1) % merged.length;
    const b = merged[next];
    if (!a || !b) break;
    merged[shortest] = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    merged.splice(next, 1);
  }
  return merged;
}

/** Medurs på skärmen, med den översta punkten först (den vänstra om flera ligger lika högt). */
function fromTopClockwise(points: readonly Point[]): Point[] {
  const ordered = signedArea(points) < 0 ? [...points].reverse() : [...points];
  let start = 0;
  for (const [i, p] of ordered.entries()) {
    const best = ordered[start] ?? p;
    if (p.y < best.y || (p.y === best.y && p.x < best.x)) start = i;
  }
  return [...ordered.slice(start), ...ordered.slice(0, start)];
}

/** Flyttar konturen till mitten av en ruta som är minst `minSideMm` på varje håll. */
function padToMinimumSide(fitted: TracedOutline, minSideMm: Mm): TracedOutline {
  const widthMm = Math.max(fitted.widthMm, minSideMm);
  const heightMm = Math.max(fitted.heightMm, minSideMm);
  const dx = (widthMm - fitted.widthMm) / 2;
  const dy = (heightMm - fitted.heightMm) / 2;
  if (dx === 0 && dy === 0) return fitted;
  return {
    points: fitted.points.map((p) => ({ x: Math.round((p.x + dx) * 100) / 100, y: Math.round((p.y + dy) * 100) / 100 })),
    widthMm,
    heightMm,
  };
}

export interface TracedOutline {
  points: Point[];
  widthMm: Mm;
  heightMm: Mm;
}

/** Kanter som hamnar precis på gränsen kan bli för korta när måttet avrundas till hela mm. */
const SHORT_EDGE_MARGIN_MM = 0.25;
/** En figur som fyller mindre än så av sin egen ruta är ett streck, inte en sluten form. */
const MIN_FILL_SHARE = 0.05;

/**
 * En spårad kontur i godtycklig skala som egen form: förenklad, lagd i den
 * största tillåtna rutan med proportionerna kvar och utan för korta kanter.
 * `null` när konturen inte är en form som går att skära.
 */
function outlineFromLoop(loop: readonly Point[]): TracedOutline | null {
  const { maxSideMm, minSideMm, minEdgeMm } = CUSTOM_SHAPE_LIMITS;
  const rough = fitOutline(simplifyOutline(loop), maxSideMm, maxSideMm);
  if (!rough) return null;
  const cleaned = mergeShortEdges(rough.points, minEdgeMm + SHORT_EDGE_MARGIN_MM);
  // Sammanslagningen kan ha dragit in ytterkanten en aning; lägg formen kant i kant igen.
  const fitted = fitOutline(cleaned, maxSideMm, maxSideMm);
  if (!fitted) return null;
  if (polygonArea(fitted.points) < fitted.widthMm * fitted.heightMm * MIN_FILL_SHARE) return null;
  const outline = padToMinimumSide({ ...fitted, points: fromTopClockwise(fitted.points) }, minSideMm);
  const issue = customOutlineIssue(outline.points, outline);
  return issue === "points" || issue === "area" ? null : outline;
}

/**
 * Spårar en mask (bredd × höjd, >0 = form) till en egen form: figurens
 * ytterkant, alltså den största konturen. En ritad linje spåras som en ring
 * och ger då linjens utsida. `null` = ingen form i bilden.
 */
export function outlineFromMask(mask: ArrayLike<number>, width: number, height: number): TracedOutline | null {
  const traced = traceLogoMask(mask, width, height);
  return traced ? outlineFromLoop(largestSubpath(traced.d)) : null;
}
