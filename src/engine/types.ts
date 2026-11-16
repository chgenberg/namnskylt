/**
 * Namnskyltmotorns domänmodell. Allt i mm, origo i skyltens övre vänstra hörn,
 * y nedåt. Dokumentet är sanningen för både 3D-vyn, ritningen och ordern
 * som skickas till leverantören.
 */

export type Mm = number;

export type FontId = "arial" | "arial-narrow";
export type TextAlign = "left" | "center" | "right";
export type BadgeShape = "rectangle" | "rounded" | "stadium" | "oval" | "round" | "hexagon" | "octagon" | "cushion" | "custom";
/** Färdigskurna ämnen som skylten graveras på — fast form och fast mått. */
export type BlankId = "rectangle" | "oval" | "rectangle-large" | "cushion" | "rectangle-long";
export type FrameStyle = "none" | "solid" | "double";
export type MountingId = "pin" | "magnet" | "clip" | "safety-pin";
/** Hur klämman sitter på baksidan: längs skylten eller på höjden. */
export type ClipOrientation = "horizontal" | "vertical";
/** Gravyr fräser ner i ytan, print trycker på den. */
export type MarkingMode = "engrave" | "print";
/** Hur namn och logga märks: en metod för båda, eller en kombination. Se `marking.ts`. */
export type MarkingMethod = "engrave" | "print" | "engrave-name-print-logo" | "print-name-engrave-logo";
export type MaterialId =
  | "metal"
  | "plastic"
  | "brass"
  | "aluminium-solid"
  | "acrylic"
  | "epoxy"
  | "aluminium-anodized"
  | "stainless"
  | "plastic-2-layer";
/** Prisklassen i kalkylen: Premium är metall, Standard är plast. */
export type SignClass = "premium" | "standard";
export type MaterialFinish = "plastic" | "aluminium" | "steel" | "brass" | "acrylic" | "epoxy";
/** Vem som tillverkar: Skylt & Gravyrteknik via API:t, Quickbutton efter bekräftad förfrågan. */
export type Producer = "skylt-gravyr" | "quickbutton";

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
 * En logga i färg, som den ska tryckas: en PNG med genomskinlig botten. `src`
 * är bildens adress på sajten när den sparats på servern (`logoImageRef`),
 * annars bilden själv i en data-URL.
 */
export interface LogoImage {
  src: string;
}

/**
 * Loggan på skylten. En enfärgad logga graveras i textens färg. Banorna ligger
 * i en egen ruta `viewWidth × viewHeight` (bara absoluta M/L/Z, fylls evenodd)
 * och skalas proportionerligt till `heightMm`.
 *
 * En logga i färg har dessutom `image` och trycks då som den är i stället för
 * att graveras. Banorna är dess siluett och rutan är bildens, så att bild och
 * banor ligger exakt över varandra.
 */
export interface BadgeLogo {
  d: string;
  viewWidth: number;
  viewHeight: number;
  placement: LogoPlacement;
  heightMm: Mm;
  /** Dragen av kunden. Hålls alltid inom säkerhetszonen av layouten. */
  offsetMm?: Offset;
  /** Loggan i färg. Den trycks som den är när loggan printas; graveras loggan används bara banorna. */
  image?: LogoImage;
  /**
   * Gravyrformen av en logga i färg, i samma ruta som `d`: det som fräses när
   * loggan graveras, med vitt inuti loggan och detaljer i en annan färg som
   * urtag. `d` är då loggans siluett, som trycket och 3D-ytan följer. Saknas
   * fältet graveras loggan ur `d`. Läs alltid med `logoEngravingPath`.
   */
  engraveD?: string;
  /**
   * Filen loggan lästes från, sparad på servern under sin SHA-256. Bara en
   * hänvisning till verkstadens underlag: den ändrar aldrig hur skylten ritas,
   * graveras eller prissätts.
   */
  originalId?: string;
}

export interface BadgeDocument {
  version: 1;
  materialId: MaterialId;
  colorId: string;
  shape: BadgeShape;
  size: { widthMm: Mm; heightMm: Mm };
  /** Gäller `shape === "rounded"` och egen form; kapseln har alltid halva höjden. */
  cornerRadiusMm: Mm;
  /**
   * Egen form (`shape === "custom"`): konturens hörn i mm inom måttet, y nedåt.
   * Sluts från sista punkten till den första. Hörnen rundas med `cornerRadiusMm`.
   */
  customOutline?: { x: Mm; y: Mm }[];
  frame: BadgeFrame;
  font: FontId;
  align: TextAlign;
  rows: BadgeTextRow[];
  /** Textblocket draget av kunden. Hålls alltid inom säkerhetszonen av layouten. */
  textOffsetMm?: Offset;
  logo?: BadgeLogo;
  /**
   * Vald märkningsmetod. Saknas den graveras namnet, och loggan trycks om den
   * är i färg och graveras annars. Läs alltid med `markingOf`, `nameMarking`
   * och `logoMarking`.
   */
  marking?: MarkingMethod;
  mounting: MountingId;
  /**
   * Klämmans riktning, när fästet är klämma. Saknas den, eller ryms den inte
   * på måttet, gäller riktningen som ryms. Läs alltid med `clipOrientationOf`.
   */
  clipOrientation?: ClipOrientation;
  quantity: number;
}

export interface Rect {
  x: Mm;
  y: Mm;
  width: Mm;
  height: Mm;
}
