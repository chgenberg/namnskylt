/**
 * Namnskyltmotorns domänmodell. Allt i mm, origo i skyltens övre vänstra hörn,
 * y nedåt. Dokumentet är sanningen för både 3D-vyn, ritningen och ordern
 * som skickas till leverantören.
 */

export type Mm = number;

export type FontId = "arial" | "arial-narrow";
export type TextAlign = "left" | "center" | "right";
export type BadgeShape = "rectangle" | "rounded" | "oval";
export type FrameStyle = "none" | "solid" | "double";
export type MountingId = "pin" | "magnet" | "clip" | "safety-pin";
export type MaterialId = "plastic-2-layer" | "aluminium-anodized" | "stainless";
export type MaterialFinish = "plastic" | "aluminium" | "steel";

export interface BadgeTextRow {
  id: string;
  text: string;
  /** Versalhöjd i mm — så mäter gravören, inte i punkter. */
  capHeightMm: Mm;
  bold: boolean;
}

export interface BadgeFrame {
  style: FrameStyle;
  /** Avstånd från skyltkanten till ramens yttre kant. */
  insetMm: Mm;
  thicknessMm: Mm;
}

export type LogoPlacement = "left" | "right" | "top";

/** Kundens förflyttning från den automatiska placeringen. */
export interface Offset {
  xMm: Mm;
  yMm: Mm;
}

/**
 * Enfärgad logga som graveras i textens färg. Banorna ligger i en egen ruta
 * `viewWidth × viewHeight` (bara absoluta M/L/Z, fylls evenodd) och skalas
 * proportionerligt till `heightMm`.
 */
export interface BadgeLogo {
  d: string;
  viewWidth: number;
  viewHeight: number;
  placement: LogoPlacement;
  heightMm: Mm;
  /** Dragen av kunden. Hålls alltid inom säkerhetszonen av layouten. */
  offsetMm?: Offset;
}

export interface BadgeDocument {
  version: 1;
  materialId: MaterialId;
  colorId: string;
  shape: BadgeShape;
  size: { widthMm: Mm; heightMm: Mm };
  /** Gäller bara `shape === "rounded"`. */
  cornerRadiusMm: Mm;
  frame: BadgeFrame;
  font: FontId;
  align: TextAlign;
  rows: BadgeTextRow[];
  /** Textblocket draget av kunden. Hålls alltid inom säkerhetszonen av layouten. */
  textOffsetMm?: Offset;
  logo?: BadgeLogo;
  mounting: MountingId;
  quantity: number;
}

export interface Rect {
  x: Mm;
  y: Mm;
  width: Mm;
  height: Mm;
}
