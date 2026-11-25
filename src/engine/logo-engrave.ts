import { traceLogoMask, type RgbaPixels } from "./logo";
import { visibleSoftness } from "./logo-color";
import { logoOutline } from "./logo-invert";
import { carveEnclosedDetail } from "./logo-mask";

/**
 * Gravyrformen av en logga i färg. En logga i färg bär sin siluett som banor
 * (`BadgeLogo.d`), eftersom trycket ritar bilden. Graveras loggan i stället
 * blir siluetten en enda fylld klump: en blå platta med vit text är bara en
 * platta. Här görs bilden om till det som faktiskt ska fräsas, i en färg:
 *
 * - bläck är det som syns och tydligt skiljer sig från vitt, alltså mörkt nog
 *   eller färgstarkt nog (gult och ljusblått graveras),
 * - vitt och mycket ljust grått som ligger intill bläck blir urtag: vit text i
 *   en blå platta, eller en vit platta bakom färgad text,
 * - vitt som står för sig självt är en del av loggan och graveras: en vit
 *   ordbild med en färgad detalj bredvid,
 * - en detalj i en annan färg som ligger helt innesluten i en fylld form blir
 *   också urtag (`carveEnclosedDetail`), så att gul text i en blå platta syns.
 *
 * Reglerna är vanlig bildbehandling, ingen AI, och körs varje gång en logga
 * läggs in. Bilden väntas frilagd: vit botten borttagen (`colorLogo`).
 */

/** Från den här täckningen räknas en pixel som synlig: en utjämnad kant avgörs vid halv täckning. */
const VISIBLE_ALPHA = 128;
/** Mörkare än så (luminans 0–255) är bläck, vilken färg det än är. Ljust grått över gränsen är papper. */
const INK_MAX_LUMINANCE = 200;
/**
 * Så stor skillnad mellan starkaste och svagaste kanal gör en ljus pixel till
 * färg och därmed till bläck: gult, ljusblått och rosa. Samma gräns som
 * avgör om en logga är i färg (`hasColor`).
 */
const INK_MIN_CHROMA = 48;
/**
 * Blir mindre än så av det som syns till bläck är loggan vit eller mycket
 * ljus (en vit logga med en liten färgad detalj). Då graveras hela siluetten,
 * som förut, hellre än bara detaljen.
 */
const MIN_INK_SHARE = 0.05;
/**
 * Så stor del av en ljus ytas kant måste ligga mot bläck för att ytan ska vara
 * botten och bli urtag. Under det står ytan för sig själv och graveras.
 */
const MIN_INK_BORDER_SHARE = 0.1;
/**
 * Så många pixlar in från det färgades kant bortses från när loggan delas i
 * platta och detalj. En utjämnad kant har egna blandfärger, tydligast i en
 * uppförstorad JPG, och skulle annars räknas som en platta runt hela loggan,
 * med loggan själv som innesluten detalj. En kontur som är smalare än dubbla
 * måttet är också för smal att fräsa för sig.
 */
const CARVE_MARGIN_PX = 3;
/**
 * Skiljer sig gravyrformen från siluetten med mindre än så (andel av det som
 * syns) är skillnaden brus längs kanterna: då graveras siluetten, och
 * inverterad räknas loggan som tom.
 */
const MIN_DIFFERENCE_SHARE = 0.005;
/** Öar och hål mindre än så (px²) är brus, till exempel från JPG-komprimering, och för små att fräsa. */
const MIN_FEATURE_PX = 12;
/** När banan inte ryms under taket städas större fläckar bort innan loggan ges upp. */
const COARSE_FEATURE_PX = MIN_FEATURE_PX * 6;

function isInk(data: ArrayLike<number>, i: number): boolean {
  const r = data[i * 4] ?? 0;
  const g = data[i * 4 + 1] ?? 0;
  const b = data[i * 4 + 2] ?? 0;
  if (Math.max(r, g, b) - Math.min(r, g, b) >= INK_MIN_CHROMA) return true;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b <= INK_MAX_LUMINANCE;
}

/**
 * Bläck som mjuk mask, 0–1: hur långt pixeln ligger från gränsen i `isInk`, i färg eller svärta.
 * Med den förfinas kanten mellan bläck och papper (`TraceOptions.soft`). `invert` vänder den,
 * för en inverterad gravyrform, där det ljusa är bläcket.
 */
function inkSoftness({ data, width, height }: RgbaPixels, invert: boolean): Float32Array {
  const soft = new Float32Array(width * height);
  for (let i = 0; i < soft.length; i++) {
    const r = data[i * 4] ?? 0;
    const g = data[i * 4 + 1] ?? 0;
    const b = data[i * 4 + 2] ?? 0;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b) - (INK_MIN_CHROMA - 0.5);
    const darkness = INK_MAX_LUMINANCE - (0.2126 * r + 0.7152 * g + 0.0722 * b);
    const ink = 0.5 + Math.max(chroma, darkness) / 510;
    soft[i] = invert ? 1 - ink : ink;
  }
  return soft;
}

/** Pixelns åtta grannar; −1 utanför bilden. */
function around(i: number, width: number, height: number): number[] {
  const x = i % width;
  const y = (i - x) / width;
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      out.push(nx < 0 || ny < 0 || nx >= width || ny >= height ? -1 : ny * width + nx);
    }
  }
  return out;
}

/** Masken krympt `rounds` pixlar från varje kant, även bildens: en pixel står kvar när alla åtta grannar finns. */
function eroded(mask: Uint8Array, width: number, height: number, rounds: number): Uint8Array {
  let current = mask;
  for (let round = 0; round < rounds; round++) {
    const next = new Uint8Array(current.length);
    // Bildens yttersta pixlar har en granne utanför bilden och faller alltid bort.
    for (let y = 1; y < height - 1; y++) {
      for (let i = y * width + 1, end = y * width + width - 1; i < end; i++) {
        if (
          current[i] &&
          current[i - 1] &&
          current[i + 1] &&
          current[i - width - 1] &&
          current[i - width] &&
          current[i - width + 1] &&
          current[i + width - 1] &&
          current[i + width] &&
          current[i + width + 1]
        ) {
          next[i] = 1;
        }
      }
    }
    current = next;
  }
  return current;
}

/** Masken vidgad `rounds` pixlar åt alla håll. */
function grown(mask: Uint8Array, width: number, height: number, rounds: number): Uint8Array {
  let current = mask;
  for (let round = 0; round < rounds; round++) {
    const next = new Uint8Array(current.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!current[y * width + x]) continue;
        for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
          for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) next[ny * width + nx] = 1;
        }
      }
    }
    current = next;
  }
  return current;
}

/**
 * Papperet utan smala remsor: en remsa under tre pixlar är en utjämnad kant
 * mellan loggan och det genomskinliga, eller en hårfin springa, inte ett urtag
 * som går att fräsa. Ytor som är bredare än så lämnas precis som de var.
 * `reach` är remsans halva bredd i pixlar: en, i bilden reglerna är inställda för.
 */
function withoutThinPaper(paper: Uint8Array, width: number, height: number, reach: number): Uint8Array {
  const near = grown(eroded(paper, width, height, reach), width, height, reach);
  const kept = new Uint8Array(paper.length);
  for (let i = 0; i < paper.length; i++) if (paper[i] && near[i]) kept[i] = 1;
  return kept;
}

/**
 * Det ljusa som är botten för något: ljusa ytor som ligger intill bläck. En
 * ljus yta som står för sig själv, med nästan hela sin kant mot det
 * genomskinliga, är en del av loggan, som en vit ordbild på genomskinlig botten.
 * Den räknas inte som papper, och graveras alltså.
 */
function paperNextToInk(light: Uint8Array, visible: Uint8Array, width: number, height: number): Uint8Array {
  const paper = new Uint8Array(light.length);
  const seen = new Uint8Array(light.length);
  for (let start = 0; start < light.length; start++) {
    if (!light[start] || seen[start]) continue;
    const component: number[] = [];
    let border = 0;
    let inkBorder = 0;
    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const i = stack.pop() ?? 0;
      component.push(i);
      let atBorder = false;
      let atInk = false;
      for (const n of around(i, width, height)) {
        if (n >= 0 && light[n]) {
          if (!seen[n]) {
            seen[n] = 1;
            stack.push(n);
          }
          continue;
        }
        atBorder = true;
        // Synligt men inte ljust är bläck; resten är det genomskinliga eller bildens kant.
        if (n >= 0 && visible[n]) atInk = true;
      }
      if (atBorder) border++;
      if (atInk) inkBorder++;
    }
    if (border > 0 && inkBorder >= border * MIN_INK_BORDER_SHARE) for (const i of component) paper[i] = 1;
  }
  return paper;
}

function count(mask: ArrayLike<number>): number {
  let total = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) total++;
  return total;
}

export type EngravingMask =
  /**
   * Loggan har en egen gravyrform: `mask` är det som fräses (1 = bläck). `outline` är konturens
   * innerkant som mjuk mask, när en inverterad form har fått en kontur.
   */
  | { kind: "detail"; mask: Uint8Array; outline?: Float32Array }
  /** Hela siluetten fräses: loggan är fylld rakt igenom, eller för ljus för att delas i bläck och papper. */
  | { kind: "silhouette" }
  /** Inverterad blir loggan tom. */
  | { kind: "empty" };

/**
 * Vad som fräses när loggan i `pixels` graveras. `invert` vänder bläck och
 * urtag inom siluetten: plattan blir urtag och texten i den bläck.
 *
 * `grain` är hur många gånger finare bilden är än den reglerna är inställda för (640 px på längsta
 * sidan). Måtten i pixlar växer med den, så att samma rand och samma fläck räknas som brus hur
 * fint bilden än läses. En finare bild ger alltså jämnare kanter, inte fler smådelar.
 */
export function engravingMask(pixels: RgbaPixels, invert = false, grain = 1): EngravingMask {
  const { data, width, height } = pixels;
  const fine = Math.max(1, grain);
  const visible = new Uint8Array(width * height);
  const light = new Uint8Array(width * height);
  for (let i = 0; i < visible.length; i++) {
    if ((data[i * 4 + 3] ?? 0) < VISIBLE_ALPHA) continue;
    visible[i] = 1;
    if (!isInk(data, i)) light[i] = 1;
  }
  const visibleCount = count(visible);
  if (visibleCount === 0) return { kind: invert ? "empty" : "silhouette" };

  // Papper är det ljusa som ligger intill bläck och är brett nog att fräsa runt. Allt annat som syns är bläck.
  const paper = withoutThinPaper(paperNextToInk(light, visible, width, height), width, height, Math.round(fine));
  const ink = new Uint8Array(visible.length);
  // Det som har färg eller svärta. Bara det delas i platta och detalj: en ljus kant runt loggan
  // är ingen platta, och skulle annars göra hela loggan till en innesluten detalj.
  const coloured = new Uint8Array(visible.length);
  for (let i = 0; i < ink.length; i++) {
    ink[i] = visible[i] && !paper[i] ? 1 : 0;
    coloured[i] = visible[i] && !light[i] ? 1 : 0;
  }

  // För lite bläck: loggan är vit eller mycket ljus, och graveras som hela sin siluett.
  const whole = count(ink) < visibleCount * MIN_INK_SHARE;
  // Detaljer letas en bit innanför kanten, där färgerna är loggans egna och inte kantens blandfärger.
  const inner = whole ? null : eroded(coloured, width, height, Math.round(CARVE_MARGIN_PX * fine));
  const carved = inner ? carveEnclosedDetail(pixels, inner, fine) : null;
  // Det som togs ur där tas också ur bläcket. Kanten och det ljusa som räknas som bläck står kvar.
  if (inner && carved) for (let i = 0; i < ink.length; i++) if (inner[i] && !carved[i]) ink[i] = 0;
  const engraved = whole ? visible : ink;

  if (invert) {
    // En form med innehåll behåller sin kant som kontur, så att formen syns också inverterad (`logoOutline`).
    const outline = logoOutline(visible, width, height);
    const inverted = new Uint8Array(visible.length);
    for (let i = 0; i < inverted.length; i++) inverted[i] = (visible[i] && !engraved[i]) || outline?.ring[i] ? 1 : 0;
    if (outline) return { kind: "detail", mask: inverted, outline: outline.soft };
    return count(inverted) < visibleCount * MIN_DIFFERENCE_SHARE ? { kind: "empty" } : { kind: "detail", mask: inverted };
  }
  return visibleCount - count(engraved) < visibleCount * MIN_DIFFERENCE_SHARE ? { kind: "silhouette" } : { kind: "detail", mask: engraved };
}

export type LogoEngraving =
  /** Gravyrformens banor, i bildens ruta (samma som siluetten spårad med `keepFrame`). */
  | { kind: "detail"; d: string }
  | { kind: "silhouette" }
  | { kind: "empty" };

/**
 * Gravyrformen som banor, spårade med samma spårare och samma tak som loggans
 * övriga banor. Ryms banan inte städas småfläckar bort; ryms den ändå inte
 * graveras siluetten.
 */
export function traceLogoEngraving(pixels: RgbaPixels, invert = false, grain = 1, tolerancePx?: number): LogoEngraving {
  const result = engravingMask(pixels, invert, grain);
  if (result.kind !== "detail") return result;
  const { width, height } = pixels;
  const area = Math.max(1, grain) ** 2;
  // Kanten mot det genomskinliga följer genomskinligheten, och kanten mot papperet färgen.
  const soft = [...(result.outline ? [result.outline] : []), visibleSoftness(pixels), inkSoftness(pixels, invert)];
  for (const feature of [MIN_FEATURE_PX, COARSE_FEATURE_PX]) {
    const minAreaPx = Math.round(feature * area);
    const traced = traceLogoMask(result.mask, width, height, { keepFrame: true, minAreaPx, soft, tolerancePx });
    if (traced) return { kind: "detail", d: traced.d };
  }
  return { kind: invert ? "empty" : "silhouette" };
}
