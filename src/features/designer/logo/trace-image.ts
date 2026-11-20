import {
  LOGO_LIMITS,
  colorLogo,
  inkTrace,
  inkPalette,
  logoPalette,
  smoothPixels,
  traceLogoEngraving,
  traceLogoMask,
  visibleMask,
  visibleSoftness,
  type LogoImage,
  type LogoPixels,
  type TracedLogo,
} from "@/engine";

/**
 * Längsta sida på bilden som spåras. 1040 px på en logga som är 50 mm bred är en tjugondels
 * millimeter per pixel, så att konturen inte får synliga hörn (besked av ägaren 2026-11-20, som
 * fick en hackig logga från en hemsida: "en ännu mer detaljerad logo-hämtare"). Förut 520 px.
 */
const TRACE_MAX_PX = 1040;
/**
 * Storlekarna reglerna för brus och smådetaljer är inställda för: en svartvit logga i 520 px och en
 * i färg i 640 px. Bilden läses finare än så, och reglerna får veta hur mycket (`grain`), så att
 * samma fläck räknas som brus som förut. Det som blir bättre är kanterna, inte antalet smådelar.
 */
const MONO_GRAIN = TRACE_MAX_PX / 520;
const COLOR_GRAIN = TRACE_MAX_PX / 640;
/** Minsta ö eller hål i en spårad siluett, i pixlar i bilden reglerna är inställda för. */
const MIN_AREA_PX = 6;
/**
 * Så långt får banan avvika från kanten, i pixlar i den fina bilden. Kanten läggs mellan pixlarna
 * (`soft`), så att en rak linje blir två punkter, och en båge får då fler hörn än förut (0,7 px).
 */
const TOLERANCE_PX = 0.5;
/** Så mycket jämnas en förstorad bild till, i pixlar per gång den förstoras, och som mest. */
const SMOOTH_PER_SCALE = 0.6;
const SMOOTH_MAX_PX = 10;
/**
 * Längsta sida på bilden av en logga i färg, den som trycks. Banorna spåras ur en finare bild
 * (`TRACE_MAX_PX`): en graverad logga i färg fick annars kantiga bokstäver, eftersom en bokstav
 * bara var ett fyrtiotal pixlar hög.
 */
const COLOR_MAX_PX = 640;
/** Blir färgbilden för tung krymps den i de här stegen tills den ryms. */
const SHRINK_STEPS = [1, 0.75, 0.56, 0.42, 0.32];

export interface LogoTrace extends TracedLogo {
  /** Loggans färger som de lästes av, den som täcker mest först. Kunden ser dem med kod och kan rätta dem. */
  colors: string[];
  /** Loggan i färg. Den trycks som den är när loggan printas. */
  image?: LogoImage;
  /** Gravyrformen av en logga i färg, när den skiljer sig från siluetten. Den fräses när loggan graveras. */
  engraveD?: string;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Bilden gick inte att läsa"));
    image.src = src;
  });
}

function canvasOf(width: number, height: number): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Webbläsaren kan inte läsa bilden");
  return { canvas, context };
}

/**
 * Bilden i storleken den läses i. `smooth` jämnar till en bild som är mindre än så och alltså
 * förstoras: dess pixlar blir annars trappsteg, och spårningen följer dem. En bild som är stor nog
 * krymps bara, och krympningen jämnar själv ut bruset.
 */
function pixels(image: HTMLImageElement, maxPx: number, smooth = false): ImageData {
  const naturalW = image.naturalWidth || maxPx;
  const naturalH = image.naturalHeight || maxPx;
  const scale = maxPx / Math.max(naturalW, naturalH);
  const width = Math.max(1, Math.round(naturalW * scale));
  const height = Math.max(1, Math.round(naturalH * scale));
  const { context } = canvasOf(width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  const read = context.getImageData(0, 0, width, height);
  const radius = smooth && scale > 1 ? Math.min(SMOOTH_MAX_PX, Math.round(scale * SMOOTH_PER_SCALE)) : 0;
  if (radius < 1) return read;
  const smoothed = smoothPixels(read, radius);
  return new ImageData(Uint8ClampedArray.from(smoothed.data), width, height);
}

/**
 * Bilden som PNG i en data-URL, högst `COLOR_MAX_PX` på längsta sidan och krympt tills den ryms
 * under taket. `null` när den inte gör det. Bilden får vara finare än så när den kommer hit: den
 * har samma ruta som banorna, som spåras ur den.
 */
function encodePng(logo: LogoPixels): string | null {
  const full = canvasOf(logo.width, logo.height);
  full.context.putImageData(new ImageData(Uint8ClampedArray.from(logo.data), logo.width, logo.height), 0, 0);
  const fit = Math.min(1, COLOR_MAX_PX / Math.max(logo.width, logo.height));
  for (const shrink of SHRINK_STEPS) {
    const step = fit * shrink;
    let canvas = full.canvas;
    if (step < 1) {
      const scaled = canvasOf(Math.max(1, Math.round(logo.width * step)), Math.max(1, Math.round(logo.height * step)));
      scaled.context.imageSmoothingQuality = "high";
      scaled.context.drawImage(full.canvas, 0, 0, scaled.canvas.width, scaled.canvas.height);
      canvas = scaled.canvas;
    }
    const src = canvas.toDataURL("image/png");
    if (src.length <= LOGO_LIMITS.maxImageChars) return src;
  }
  return null;
}

/** Bilden gick inte att läsa som en logga i färg: den är svartvit, eller för tung även som minst. */
const NOT_COLOR = Symbol("svartvit");

/**
 * En bild i färg blir en logga med tre delar i samma ruta: bilden frilagd och
 * beskuren (trycks när loggan printas), dess siluett som banor, och
 * gravyrformen (fräses när loggan graveras), när den skiljer sig från
 * siluetten. `invert` vänder bläck och urtag i gravyrformen; `null` när
 * den då blir tom.
 */
function colorTrace(image: HTMLImageElement, invert: boolean): LogoTrace | null | typeof NOT_COLOR {
  const logo = colorLogo(pixels(image, TRACE_MAX_PX));
  if (!logo) return NOT_COLOR;
  const mask = visibleMask(logo);
  const minAreaPx = Math.round(MIN_AREA_PX * COLOR_GRAIN ** 2);
  const traced = traceLogoMask(mask, logo.width, logo.height, {
    keepFrame: true,
    minAreaPx,
    soft: [visibleSoftness(logo)],
    tolerancePx: TOLERANCE_PX,
  });
  const src = traced ? encodePng(logo) : null;
  if (!traced || !src) return NOT_COLOR;
  const engraving = traceLogoEngraving(logo, invert, COLOR_GRAIN, TOLERANCE_PX);
  if (engraving.kind === "empty") return null;
  return {
    ...traced,
    colors: logoPalette(logo),
    image: { src },
    ...(engraving.kind === "detail" && { engraveD: engraving.d }),
  };
}

/**
 * Gravyrformen till en logga i färg som saknar den: en skylt som sparades
 * innan gravyrformen fanns, eller kom i en delad länk. Räknas ur loggans bild,
 * ritad i banornas ruta. `null` när siluetten är gravyrformen, eller bilden
 * inte går att läsa.
 */
export async function engravingFromImage(src: string, viewWidth: number, viewHeight: number): Promise<string | null> {
  const image = await loadImage(src);
  const width = Math.max(1, Math.round(viewWidth));
  const height = Math.max(1, Math.round(viewHeight));
  const { context } = canvasOf(width, height);
  context.drawImage(image, 0, 0, width, height);
  // Rutan är banornas: en logga som lagts in efter 2026-11-20 har en finare ruta än reglerna är inställda för.
  const grain = Math.max(1, Math.max(width, height) / COLOR_MAX_PX);
  const engraving = traceLogoEngraving(context.getImageData(0, 0, width, height), false, grain, grain > 1 ? TOLERANCE_PX : undefined);
  return engraving.kind === "detail" ? engraving.d : null;
}

/**
 * Läser en bild (data- eller objekt-URL) till en logga. En bild i färg kan
 * både printas som den är och graveras i sin gravyrform; en svartvit spåras
 * till banor. `invert` vänder bläck och botten, och gäller bara det som
 * graveras eller printas i en färg. `null` = ingen logga i bilden.
 */
export async function traceImage(src: string, invert = false): Promise<LogoTrace | null> {
  const image = await loadImage(src);
  const colored = colorTrace(image, invert);
  if (colored !== NOT_COLOR) return colored;
  const imageData = pixels(image, TRACE_MAX_PX, true);
  const { mask, soft } = inkTrace(imageData, invert, MONO_GRAIN);
  const traced = traceLogoMask(mask, imageData.width, imageData.height, {
    minAreaPx: Math.round(MIN_AREA_PX * MONO_GRAIN ** 2),
    soft: [soft],
    tolerancePx: TOLERANCE_PX,
  });
  // En logga som spåras i en färg har ändå en färg i filen, till exempel röd: den läses ur det som är bläck.
  return traced ? { ...traced, colors: inkPalette(imageData, mask) } : null;
}
