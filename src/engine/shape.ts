import type { BadgeDocument, Mm } from "./types";

function num(value: number): string {
  return Number.isFinite(value) ? String(Number(value.toFixed(4))) : "0";
}

/** Effektiv hörnradie efter klampning mot skyltens halva kortsida. */
export function effectiveCornerRadius(doc: BadgeDocument): Mm {
  if (doc.shape !== "rounded") return 0;
  const { widthMm, heightMm } = doc.size;
  return Math.max(0, Math.min(doc.cornerRadiusMm, Math.min(widthMm, heightMm) / 2));
}

/**
 * Kontur som SVG-path, indragen `inset` mm från skyltkanten. Indragen kontur
 * används av ramen och säkerhetszonen så att de följer formen.
 */
export function outlinePath(doc: BadgeDocument, inset: Mm = 0): string {
  const w = doc.size.widthMm - inset * 2;
  const h = doc.size.heightMm - inset * 2;
  if (w <= 0 || h <= 0) return "";
  const x = inset;
  const y = inset;

  if (doc.shape === "oval") {
    const rx = w / 2;
    const ry = h / 2;
    const cx = x + rx;
    return `M${num(cx - rx)} ${num(y + ry)}a${num(rx)} ${num(ry)} 0 1 0 ${num(w)} 0a${num(rx)} ${num(ry)} 0 1 0 ${num(-w)} 0Z`;
  }

  const r = Math.max(0, Math.min(effectiveCornerRadius(doc) - inset, w / 2, h / 2));
  if (r === 0) return `M${num(x)} ${num(y)}h${num(w)}v${num(h)}h${num(-w)}Z`;
  return [
    `M${num(x + r)} ${num(y)}`,
    `h${num(w - 2 * r)}`,
    `a${num(r)} ${num(r)} 0 0 1 ${num(r)} ${num(r)}`,
    `v${num(h - 2 * r)}`,
    `a${num(r)} ${num(r)} 0 0 1 ${num(-r)} ${num(r)}`,
    `h${num(-(w - 2 * r))}`,
    `a${num(r)} ${num(r)} 0 0 1 ${num(-r)} ${num(-r)}`,
    `v${num(-(h - 2 * r))}`,
    `a${num(r)} ${num(r)} 0 0 1 ${num(r)} ${num(-r)}`,
    "Z",
  ].join("");
}

/**
 * Tillgänglig halvbredd på höjden `y0…y1` inuti konturen indragen `inset`.
 * På en oval och i rundade hörn krymper bredden mot över- och underkant; en
 * rak skylt har samma bredd hela vägen.
 */
export function availableHalfWidth(doc: BadgeDocument, inset: Mm, y0: Mm, y1: Mm): Mm {
  const halfW = doc.size.widthMm / 2 - inset;
  if (halfW <= 0) return 0;
  if (doc.shape === "rounded") return roundedHalfWidth(doc, inset, halfW, y0, y1);
  if (doc.shape !== "oval") return halfW;

  const cy = doc.size.heightMm / 2;
  const halfH = doc.size.heightMm / 2 - inset;
  if (halfH <= 0) return 0;
  const dy = Math.max(Math.abs(y0 - cy), Math.abs(y1 - cy));
  const t = Math.min(1, dy / halfH);
  return halfW * Math.sqrt(1 - t * t);
}

/** Samma indragna hörnbåge som `outlinePath(doc, inset)` ritar. */
function roundedHalfWidth(doc: BadgeDocument, inset: Mm, halfW: Mm, y0: Mm, y1: Mm): Mm {
  const halfH = doc.size.heightMm / 2 - inset;
  const r = Math.max(0, Math.min(effectiveCornerRadius(doc) - inset, halfW, halfH));
  if (r === 0) return halfW;
  const arcTop = inset + r;
  const arcBottom = doc.size.heightMm - inset - r;
  const dy = Math.min(r, Math.max(0, arcTop - y0, y1 - arcBottom));
  return halfW - r + Math.sqrt(r * r - dy * dy);
}
