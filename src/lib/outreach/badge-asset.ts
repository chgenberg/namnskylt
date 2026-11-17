import { randomBytes } from "node:crypto";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import {
  badgeDocumentSchema,
  BLANKS,
  createBadgeDocument,
  getColor,
  getMaterial,
  layoutBadge,
  LOGO_LIMITS,
  renderBadgeSvg,
  TEXT_LIMITS,
  withBlank,
  type BadgeDocument,
  type BadgeShape,
  type BlankId,
  type FontEngine,
  type MaterialId,
  type TracedLogo,
} from "@/engine";
import { firstNameOf, isEmailLike } from "./model";

/** Skylten i mejlet: bara det som säljs på sajten och som Skylt & Gravyrteknik tillverkar. */

export const HERO_MATERIAL: MaterialId = "metal";
const HERO_WIDTH_PX = 1200;
const HERO_HEIGHT_PX = 600;
const HERO_FALLBACK_WIDTH_PX = 1000;
export const MAX_HERO_BYTES = 100 * 1024;
const TILE_WIDTH_PX = 560;
const TILE_HEIGHT_PX = 360;
const JPEG_QUALITY = 75;
const PAPER = "#f3f1ec";
const MIN_ENGRAVED_NAME_CHARS = 2;
const COMPANY_FORM = /\s+(AB|Aktiebolag|HB|KB|AS|ASA|ApS|Oy)\.?$/i;

export type LogoStatus = "logo" | "text-only";

/** Id:t står i bildadressen i mejlet och får inte gå att gissa. */
export const ASSET_ID_PATTERN = /^[A-Za-z0-9_-]{16,40}$/;

export function newAssetId(): string {
  return randomBytes(12).toString("base64url");
}

export function assetPath(id: string): string {
  return `/utskick/bild/${id}.jpg`;
}

/** `abc.jpg` → `abc`; `null` om adressen inte är ett bild-id. */
export function assetIdFromPath(segment: string): string | null {
  const id = segment.replace(/\.jpe?g$/i, "");
  return ASSET_ID_PATTERN.test(id) ? id : null;
}

export interface BadgeLeadInput {
  contactName: string | null;
  companyName: string;
}

export interface LeadBadge {
  doc: BadgeDocument;
  logoStatus: LogoStatus;
}

/** En yta på ett ämne i `HERO_MATERIAL`. */
export interface BadgeChoice {
  colorId: string;
  blankId: BlankId;
}

/** Mejlets skylt: mässing på rektangeln — den som syns bäst mot ljust papper. */
export const HERO_CHOICE: BadgeChoice = { colorId: "metal-gold", blankId: "metal-rectangle" };

/** Kontaktnamnet graveras bara om det ser ut som ett namn. */
export function engravedName(contactName: string | null): string | null {
  const name = (contactName ?? "").trim().replace(/\s+/g, " ");
  if (name.length < MIN_ENGRAVED_NAME_CHARS || name.length > TEXT_LIMITS.maxChars) return null;
  if (isEmailLike(name) || name.includes("@")) return null;
  return name;
}

/** Företagsnamnet som en skyltrad. Ryms det inte stryks bolagsformen och sedan hela ord från slutet. */
export function badgeCompanyName(companyName: string): string {
  const name = companyName.trim().replace(/\s+/g, " ");
  if (name.length <= TEXT_LIMITS.maxChars) return name;
  const short = name.replace(COMPANY_FORM, "");
  if (short.length <= TEXT_LIMITS.maxChars) return short;
  const lastSpace = short.slice(0, TEXT_LIMITS.maxChars + 1).lastIndexOf(" ");
  return lastSpace > 0 ? short.slice(0, lastSpace) : short.slice(0, TEXT_LIMITS.maxChars);
}

/**
 * Namnet på skylten i personbilden. Personen är påhittad, så den får bara
 * bära förnamnet — aldrig mottagarens hela namn.
 */
export function personaBadgeName(contactName: string | null): string | null {
  return firstNameOf(engravedName(contactName));
}

/** Rutorna på landningssidan: fyra av metallens format och alla tre ytor. Den första är mejlets skylt. */
export function tileChoices(): BadgeChoice[] {
  return [
    HERO_CHOICE,
    { colorId: "metal-silver", blankId: "metal-oval" },
    { colorId: "metal-white", blankId: "metal-rectangle-slim" },
    { colorId: "metal-silver", blankId: "metal-tv" },
  ];
}

export interface TileBadge {
  materialId: MaterialId;
  colorId: string;
  shape: BadgeShape;
  widthMm: number;
  heightMm: number;
}

/**
 * Etiketten under rutan: `Nickel, oval`. Äldre rutor ligger inte på
 * något ämne och heter efter materialet: `Gravyrplast, Vit / Svart` eller `Rostfritt stål`.
 */
export function tileLabel(tile: TileBadge): string {
  const material = getMaterial(tile.materialId);
  const color = getColor(tile.materialId, tile.colorId);
  const blank = BLANKS.find((b) => b.shape === tile.shape && b.widthMm === tile.widthMm && b.heightMm === tile.heightMm);
  if (material.offered && blank) return `${color.name}, ${blank.name.toLowerCase()}`;
  return material.colors.length > 2 ? `${material.name}, ${color.name}` : material.name;
}

export function badgeForLead(input: BadgeLeadInput, logo: TracedLogo | null, choice: BadgeChoice = HERO_CHOICE): LeadBadge {
  const name = engravedName(input.contactName);
  const company = badgeCompanyName(input.companyName);
  const rows = name && name.toLowerCase() !== company.toLowerCase() ? [name, company] : [company];
  const draft: BadgeDocument = {
    ...withBlank(createBadgeDocument(rows), choice.blankId),
    materialId: HERO_MATERIAL,
    colorId: choice.colorId,
    ...(logo && {
      logo: {
        d: logo.d,
        viewWidth: logo.viewWidth,
        viewHeight: logo.viewHeight,
        placement: "left" as const,
        heightMm: LOGO_LIMITS.defaultHeightMm,
      },
    }),
  };
  const parsed = badgeDocumentSchema.safeParse(draft);
  if (!parsed.success) {
    const textOnly = badgeDocumentSchema.parse({ ...draft, logo: undefined }) as BadgeDocument;
    return { doc: textOnly, logoStatus: "text-only" };
  }
  return { doc: parsed.data as BadgeDocument, logoStatus: logo ? "logo" : "text-only" };
}

/** Bildtexten under hjältebilden: `metall, mässing, 60 × 30 mm`. */
export function badgeCaption(badge: { materialId: MaterialId; colorId: string; widthMm: number; heightMm: number }): string {
  const material = getMaterial(badge.materialId);
  const color = getColor(badge.materialId, badge.colorId);
  return `${material.name.toLowerCase()}, ${color.name.toLowerCase()}, ${badge.widthMm} × ${badge.heightMm} mm`;
}

function sceneSvg(doc: BadgeDocument, fonts: FontEngine, width: number, height: number, badgeShare: number): string {
  const badgeW = Math.round(width * badgeShare);
  const badgeH = Math.round((badgeW * doc.size.heightMm) / doc.size.widthMm);
  const x = Math.round((width - badgeW) / 2);
  const y = Math.round((height - badgeH) / 2 - height * 0.03);
  const badge = renderBadgeSvg(doc, layoutBadge(doc, fonts), { mode: "preview", fonts, idPrefix: "hero" }).replace(
    "<svg ",
    `<svg x="${x}" y="${y}" width="${badgeW}" height="${badgeH}" `,
  );
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs><radialGradient id="paper" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#fbfaf7"/><stop offset="1" stop-color="${PAPER}"/></radialGradient>`,
    `<filter id="shade" x="-20%" y="-80%" width="140%" height="260%"><feGaussianBlur stdDeviation="${Math.round(width / 60)}"/></filter></defs>`,
    `<rect width="100%" height="100%" fill="url(#paper)"/>`,
    `<ellipse cx="${width / 2}" cy="${y + badgeH + height * 0.05}" rx="${badgeW * 0.44}" ry="${height * 0.035}" fill="#0b1f3a" fill-opacity=".22" filter="url(#shade)"/>`,
    badge,
    `</svg>`,
  ].join("");
}

async function toJpeg(svg: string, width: number): Promise<{ bytes: Buffer; width: number; height: number }> {
  const png = new Resvg(svg, { font: { loadSystemFonts: false }, fitTo: { mode: "width", value: width } }).render().asPng();
  const { data, info } = await sharp(png)
    .flatten({ background: PAPER })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { bytes: data, width: info.width, height: info.height };
}

/** Hjältebilden, 1200 × 600. Blir den tyngre än taket görs den om i 1000 px. */
export async function heroJpeg(doc: BadgeDocument, fonts: FontEngine) {
  const svg = sceneSvg(doc, fonts, HERO_WIDTH_PX, HERO_HEIGHT_PX, 0.72);
  const full = await toJpeg(svg, HERO_WIDTH_PX);
  return full.bytes.length <= MAX_HERO_BYTES ? full : toJpeg(svg, HERO_FALLBACK_WIDTH_PX);
}

export async function tileJpeg(doc: BadgeDocument, fonts: FontEngine) {
  return toJpeg(sceneSvg(doc, fonts, TILE_WIDTH_PX, TILE_HEIGHT_PX, 0.8), TILE_WIDTH_PX);
}
