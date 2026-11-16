import "server-only";
import type OpenAI from "openai";
import sharp from "sharp";
import { outlineFromMask, silhouetteMask } from "@/engine";
import { IMAGE_MODEL } from "./openai";
import { createShapeLimits } from "./shape-limits";
import { shapePrompt } from "./shape-prompt";

/** Bildens sida i pixlar: samma som webbläsaren spårar en uppladdad bild i. */
const IMAGE_PX = 1024;
/**
 * Oskärpan som jämnar ut bildmodellens taggiga kant, i pixlar.
 */
const SMOOTH_SIGMA_PX = 4;
/**
 * Smala springor i formen sluts: formen växer först så här många
 * standardavvikelser av oskärpan och krymper sedan lika mycket. Vid 1,6 är det
 * drygt 6 pixlar åt varje håll, alltså springor upp till en dryg millimeter
 * på en skylt i största mått. En sådan springa går ändå inte att skära rent.
 */
const CLOSE_SIGMAS = 1.6;
/** En figur som täcker mindre än så av bilden räknas inte som en form. */
const MIN_FIGURE_SHARE = 0.01;
/** Bildmodellen svarar oftast inom en halv minut. Längre än så väntar kunden inte. */
const DRAW_TIMEOUT_MS = 75_000;

/**
 * Gråvärdet som flyttar en suddad svartvit kant `sigmas` standardavvikelser in
 * i det vita (positivt) eller in i det svarta (negativt), när tröskeln läggs där.
 */
function greyLevel(sigmas: number): number {
  // Normalfördelningens fördelningsfunktion, logistisk närmevärdering: felet är under en procent.
  const share = 1 / (1 + Math.exp(-1.702 * sigmas));
  return Math.min(254, Math.max(1, Math.round(255 * share)));
}

/** Gränserna för hela processen. En rad per besökare och en för sajten. */
export const shapeLimits = createShapeLimits();

/** Bilden gick att göra, men den innehåller ingen form som går att skära. */
export class NoShapeError extends Error {
  constructor() {
    super("Bilden saknar en sluten form");
    this.name = "NoShapeError";
  }
}

/** Första kanalen ur en rå bild: gråvärdet per pixel. sharp svarar ibland med tre kanaler också för en gråbild. */
function firstChannel(data: Buffer, channels: number, pixels: number): Buffer {
  if (channels === 1) return data;
  const grey = Buffer.alloc(pixels);
  for (let i = 0; i < pixels; i++) grey[i] = data[i * channels] ?? 255;
  return grey;
}

/** En gråbild med en kanal, suddad. Oskärpan görs för sig: i en och samma sharp-kedja läggs tröskeln alltid före oskärpan. */
async function blurred(grey: Buffer, width: number, height: number): Promise<Buffer> {
  const { data, info } = await sharp(grey, { raw: { width, height, channels: 1 } })
    .blur(SMOOTH_SIGMA_PX)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return firstChannel(data, info.channels, width * height);
}

/** Svart (0) där gråvärdet ligger under `level`, annars vitt (255). */
function thresholded(grey: Buffer, level: number): Buffer {
  const out = Buffer.alloc(grey.length);
  for (let i = 0; i < grey.length; i++) out[i] = (grey[i] ?? 255) < level ? 0 : 255;
  return out;
}

/**
 * Gör om bildmodellens bild till en ren siluett: svart form på vit botten,
 * utan gråtoner, som PNG i en data-URL. Kastar `NoShapeError` när bilden inte
 * ger en form med samma spårning som webbläsaren sedan gör
 * (`readShapeFile`), så att kunden får ett begripligt besked härifrån.
 */
export async function silhouettePng(image: Buffer): Promise<string> {
  const white = { r: 255, g: 255, b: 255 };
  const { data, info } = await sharp(image)
    .flatten({ background: white })
    .resize(IMAGE_PX, IMAGE_PX, { fit: "contain", background: white })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const grey = firstChannel(data, info.channels, width * height);
  // Först växer det svarta: en pixel blir vit bara om den är klart vit efter oskärpan.
  const grown = thresholded(await blurred(grey, width, height), greyLevel(CLOSE_SIGMAS));
  // Sedan krymper det tillbaka lika mycket. Det som slöts på vägen förblir slutet.
  const ink = thresholded(await blurred(grown, width, height), greyLevel(-CLOSE_SIGMAS));
  // En prick som förstoras till en hel skylt är ingen form. Det mindre av svart och vitt ska vara en synlig del av bilden.
  let black = 0;
  for (let i = 0; i < ink.length; i++) if (ink[i] === 0) black++;
  if (Math.min(black, ink.length - black) < ink.length * MIN_FIGURE_SHARE) throw new NoShapeError();
  // Spårningen läser färg och täckning per pixel.
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < ink.length; i++) {
    const value = ink[i] ?? 255;
    rgba[i * 4] = value;
    rgba[i * 4 + 1] = value;
    rgba[i * 4 + 2] = value;
    rgba[i * 4 + 3] = 255;
  }
  if (!outlineFromMask(silhouetteMask({ data: rgba, width, height }), width, height)) throw new NoShapeError();
  const png = await sharp(ink, { raw: { width, height, channels: 1 } })
    .png({ palette: true, colours: 2, dither: 0, compressionLevel: 9 })
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

/**
 * Ritar formen kunden beskriver: bildmodellen gör en siluett i låg kvalitet
 * (det räcker för en kontur och kostar minst), och svaret är en svartvit PNG
 * som webbläsaren spårar på samma sätt som en uppladdad bild.
 * `description` ska vara rensad (`shapeDescriptionSchema`).
 */
export async function drawShapeImage(ai: OpenAI, description: string): Promise<string> {
  const result = await ai.images.generate(
    {
      model: IMAGE_MODEL,
      prompt: shapePrompt(description),
      size: "1024x1024",
      quality: "low",
      background: "opaque",
      output_format: "png",
      n: 1,
    },
    { timeout: DRAW_TIMEOUT_MS, maxRetries: 0 },
  );
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error("Bildmodellen returnerade ingen bild");
  return silhouettePng(Buffer.from(b64, "base64"));
}
