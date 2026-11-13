import { outlineFromMask, silhouetteMask, type TracedOutline } from "@/engine";

/** Filtyperna filväljaren släpper igenom. */
export const SHAPE_FILE_ACCEPT = ".svg,.png,.jpg,.jpeg,.pdf,image/svg+xml,image/png,image/jpeg,application/pdf";
const MAX_FILE_BYTES = 8 * 1024 * 1024;
/** Längsta sida på bilden som spåras — skarpt nog också när formen bara fyller en del av sidan. */
const TRACE_MAX_PX = 1024;
/** CSS-pixlar per enhet, för en SVG som anger sitt mått i annat än pixlar. */
const SVG_UNIT_PX: Record<string, number> = { "": 1, px: 1, pt: 96 / 72, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 };

type ShapeFileResult = { ok: true; outline: TracedOutline } | { ok: false; message: string };

type FileKind = "svg" | "raster" | "pdf";

function kindOf(file: File): FileKind | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (file.type === "image/svg+xml" || name.endsWith(".svg")) return "svg";
  if (file.type === "image/png" || file.type === "image/jpeg" || /\.(png|jpe?g)$/.test(name)) return "raster";
  return null;
}

function svgLengthPx(value: string | null): number | null {
  const match = value?.trim().match(/^(\d*\.?\d+)([a-z]*)$/i);
  const unit = SVG_UNIT_PX[match?.[2]?.toLowerCase() ?? "-"];
  const px = match && unit ? Number(match[1]) * unit : 0;
  return px > 0 ? px : null;
}

/**
 * En SVG utan eget mått ritas inte på en canvas i alla webbläsare, och en liten
 * SVG blir suddig när den förstoras. Här får den sin viewBox som mått, i
 * spårningens upplösning. Går filen inte att tolka lämnas den som den är.
 */
async function sizedSvg(file: File): Promise<Blob> {
  const parsed = new DOMParser().parseFromString(await file.text(), "image/svg+xml");
  const svg = parsed.documentElement;
  if (svg.nodeName.toLowerCase() !== "svg" || parsed.querySelector("parsererror")) return file;
  const viewBox = (svg.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  let width = viewBox.length === 4 ? (viewBox[2] ?? 0) : 0;
  let height = viewBox.length === 4 ? (viewBox[3] ?? 0) : 0;
  if (!(width > 0 && height > 0)) {
    width = svgLengthPx(svg.getAttribute("width")) ?? 0;
    height = svgLengthPx(svg.getAttribute("height")) ?? 0;
    if (!(width > 0 && height > 0)) return file;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }
  const scale = TRACE_MAX_PX / Math.max(width, height);
  svg.setAttribute("width", String(Math.max(1, Math.round(width * scale))));
  svg.setAttribute("height", String(Math.max(1, Math.round(height * scale))));
  return new Blob([new XMLSerializer().serializeToString(parsed)], { type: "image/svg+xml" });
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

function traceCanvas(width: number, height: number): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Webbläsaren kan inte läsa bilden");
  return { canvas, context };
}

async function imagePixels(source: Blob): Promise<ImageData> {
  const url = URL.createObjectURL(source);
  try {
    const image = await loadImage(url);
    const naturalWidth = image.naturalWidth || TRACE_MAX_PX;
    const naturalHeight = image.naturalHeight || TRACE_MAX_PX;
    const scale = TRACE_MAX_PX / Math.max(naturalWidth, naturalHeight);
    const { canvas, context } = traceCanvas(naturalWidth * scale, naturalHeight * scale);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Första sidan i en PDF, ritad med pdf.js. Biblioteket är stort och laddas först när en PDF väljs.
 * Den minifierade byggfilen är den som går att ladda genom Next/webpack, se `src/types/pdfjs-dist.d.ts`.
 */
async function pdfPixels(file: File): Promise<ImageData> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const page = await (await task.promise).getPage(1);
    const unscaled = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: TRACE_MAX_PX / Math.max(unscaled.width, unscaled.height) });
    const { canvas, context } = traceCanvas(viewport.width, viewport.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    return context.getImageData(0, 0, canvas.width, canvas.height);
  } finally {
    await task.destroy();
  }
}

/**
 * Läser en uppladdad fil till en egen form: filen ritas på en canvas, blir en
 * mask och spåras till figurens ytterkant. Svaret bär ett fel som kunden kan
 * förstå när filen är för stor, av fel typ, oläslig eller saknar en sluten form.
 */
export async function readShapeFile(file: File): Promise<ShapeFileResult> {
  if (file.size > MAX_FILE_BYTES) return { ok: false, message: "Filen är för stor. Den får vara högst 8 MB." };
  const kind = kindOf(file);
  if (!kind) return { ok: false, message: "Den filtypen går inte att läsa. Ladda upp en SVG, PNG, JPG eller PDF." };
  let pixels: ImageData;
  try {
    pixels = kind === "pdf" ? await pdfPixels(file) : await imagePixels(kind === "svg" ? await sizedSvg(file) : file);
  } catch {
    return { ok: false, message: "Filen gick inte att läsa. Prova att spara den på nytt som SVG eller PNG." };
  }
  const outline = outlineFromMask(silhouetteMask(pixels), pixels.width, pixels.height);
  return outline
    ? { ok: true, outline }
    : {
        ok: false,
        message:
          "Vi hittade ingen sluten form i filen. Det går bäst med en fylld figur eller en sluten linje mot vit eller genomskinlig bakgrund.",
      };
}
