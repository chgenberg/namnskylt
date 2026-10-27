import type { FontEngine, FontFace, MountingId } from "@/engine";
import type { Box, PackedHeader } from "./packing";

/** Rubrikerna graveras i Arial Bold, som verkstadens egna ark. */
export const HEADER_FACE: FontFace = { fontId: "arial", bold: true };
const HEADER_TEXT_RATIO = 0.7;
export const ORDER_HEADER_CAP_MAX_MM = 4.5;
/** Skivans rubrik är kort och ska inte fylla bandet. */
export const SHEET_HEADER_CAP_MAX_MM = 3;
/** Under den här versalhöjden är gravyren inte läsbar i verkstaden. */
export const HEADER_CAP_MIN_MM = 2.5;
/** Underhäng under baslinjen i em för Arial Bold, så svansarna stannar i bandet. */
const HEADER_DESCENDER_EM = 0.22;

const MOUNTING_TAG: Record<MountingId, string> = {
  pin: "NÅL",
  magnet: "MAGNET",
  clip: "KLÄMMA",
  "safety-pin": "SÄKERHETSNÅL",
};

/**
 * `#NS-1042 MAGNET 2/3`. Löpnumret skrivs alltid, även `1/1`, så den som
 * plockar ihop leveransen ser att det inte finns fler block att leta efter.
 */
export function orderHeaderText(header: Pick<PackedHeader, "orderNo" | "mounting" | "sectionNo" | "sectionCount">): string {
  const total = Math.max(header.sectionNo, header.sectionCount);
  return `#${header.orderNo} ${MOUNTING_TAG[header.mounting]} ${header.sectionNo}/${total}`;
}

/** `[PO#2026-014] Skiva 2/5`. Utan produktionsnummer: `[PO# -]`. */
export function sheetHeaderText(productionNo: string | null, sheetNo: number, sheetCount: number): string {
  const tag = productionNo ? `[PO#${productionNo}]` : "[PO# -]";
  return `${tag} Skiva ${sheetNo}/${Math.max(sheetNo, sheetCount)}`;
}

export interface FittedHeader {
  text: string;
  capMm: number;
  fontSizeMm: number;
  xMm: number;
  baselineMm: number;
}

/**
 * Passar in rubriken i sin ruta: krymper ner till läsbarhetsgolvet och kapar
 * först därefter med ellips. Rutan är blockets bredd — gravyren får aldrig gå
 * in över grannens skyltar.
 */
export function fitHeader(text: string, box: Box, maxCapMm: number, fonts: FontEngine): FittedHeader | null {
  const ratio = fonts.capHeightRatio(HEADER_FACE);
  const widthAt = (t: string, cap: number) => fonts.measure(t, { ...HEADER_FACE, sizeMm: cap / ratio });
  const at = (t: string, capMm: number): FittedHeader => ({
    text: t,
    capMm,
    fontSizeMm: capMm / ratio,
    xMm: box.xMm,
    baselineMm: box.yMm + box.heightMm - (capMm / ratio) * HEADER_DESCENDER_EM,
  });
  const startCap = Math.min(box.heightMm * HEADER_TEXT_RATIO, maxCapMm);
  if (!text || !(box.widthMm > 0) || !(startCap > 0)) return null;

  const full = widthAt(text, startCap);
  if (full <= box.widthMm) return at(text, startCap);
  // Bredden är linjär i versalhöjden, så den här höjden fyller rutan exakt.
  const shrunk = (startCap * box.widthMm) / full;
  if (shrunk >= HEADER_CAP_MIN_MM) return at(text, shrunk);

  for (let length = text.length - 1; length >= 1; length -= 1) {
    const candidate = `${text.slice(0, length).trimEnd()}…`;
    if (widthAt(candidate, HEADER_CAP_MIN_MM) <= box.widthMm) return at(candidate, HEADER_CAP_MIN_MM);
  }
  return null;
}
