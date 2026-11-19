import {
  LOGO_LIMITS,
  colorLogo,
  inkMask,
  inkPalette,
  logoPalette,
  traceLogoEngraving,
  traceLogoMask,
  visibleMask,
  type LogoImage,
  type LogoPixels,
  type TracedLogo,
} from "@/engine";

/** Längsta sida på bilden som spåras — skarpt nog för en logga på 5–40 mm. */
const TRACE_MAX_PX = 520;
/** Längsta sida på bilden som en logga i färg läses i. */
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

function pixels(image: HTMLImageElement, maxPx: number): ImageData {
  const naturalW = image.naturalWidth || maxPx;
  const naturalH = image.naturalHeight || maxPx;
  const scale = maxPx / Math.max(naturalW, naturalH);
  const width = Math.max(1, Math.round(naturalW * scale));
  const height = Math.max(1, Math.round(naturalH * scale));
  const { context } = canvasOf(width, height);
  context.drawImage(image, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

/** Bilden som PNG i en data-URL, krympt tills den ryms under taket. `null` när den inte gör det. */
function encodePng(logo: LogoPixels): string | null {
  const full = canvasOf(logo.width, logo.height);
  full.context.putImageData(new ImageData(Uint8ClampedArray.from(logo.data), logo.width, logo.height), 0, 0);
  for (const step of SHRINK_STEPS) {
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
  const logo = colorLogo(pixels(image, COLOR_MAX_PX));
  if (!logo) return NOT_COLOR;
  const mask = visibleMask(logo);
  const traced = traceLogoMask(mask, logo.width, logo.height, { keepFrame: true });
  const src = traced ? encodePng(logo) : null;
  if (!traced || !src) return NOT_COLOR;
  const engraving = traceLogoEngraving(logo, invert);
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
  const engraving = traceLogoEngraving(context.getImageData(0, 0, width, height));
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
  const imageData = pixels(image, TRACE_MAX_PX);
  const mask = inkMask(imageData, invert);
  const traced = traceLogoMask(mask, imageData.width, imageData.height);
  // En logga som spåras i en färg har ändå en färg i filen, till exempel röd: den läses ur det som är bläck.
  return traced ? { ...traced, colors: inkPalette(imageData, mask) } : null;
}
