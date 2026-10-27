import "server-only";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { createBadgeDocument, layoutBadge, renderBadgeSvg, type FontEngine } from "@/engine";
import { readableOn } from "@/lib/company/profile";
import { loadNodeFontEngine } from "@/lib/fonts/load-node";
import type { Shop } from "@/lib/shops/model";

/** Dubbel upplösning mot mejlets 552 px bildbredd — skarpt på retinaskärmar. */
export const MOCKUP_WIDTH_PX = 1104;
export const MOCKUP_HEIGHT_PX = 610;

const INK = "#0a0a0b";
const MUTED = "#6b7079";
const LOGO_HEIGHT_PX = 46;
const MAX_EYEBROW_CHARS = 34;

function text(fonts: FontEngine, value: string, sizePx: number, bold: boolean, x: number, baseline: number, fill: string) {
  const d = fonts.outline?.(value, { fontId: "arial", bold, sizeMm: sizePx }, x, baseline) ?? "";
  return d ? `<path d="${d}" fill="${fill}"/>` : "";
}

function tint(hex: string, amount: number): string {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `#${c.map((v) => Math.round(v + (255 - v) * amount).toString(16).padStart(2, "0")).join("")}`;
}

/** Loggan som PNG i rätt höjd — resvg läser inte alla bildformat i data-URL:er. */
async function logoImage(dataUrl: string | null): Promise<{ href: string; width: number } | null> {
  const base64 = dataUrl?.split(",")[1];
  if (!base64) return null;
  try {
    const { data, info } = await sharp(Buffer.from(base64, "base64"))
      .resize({ height: LOGO_HEIGHT_PX * 2, width: 520, fit: "inside" })
      .png()
      .toBuffer({ resolveWithObject: true });
    return { href: `data:image/png;base64,${data.toString("base64")}`, width: (info.width / info.height) * LOGO_HEIGHT_PX };
  } catch {
    return null;
  }
}

/**
 * Butiken som den ser ut för deras kunder: deras logga och färger i ett
 * webbläsarfönster, rubriken från startsidan och en graverad skylt.
 */
export async function renderShopMockup(shop: Shop, logoPlate: string | null): Promise<Buffer> {
  const fonts = await loadNodeFontEngine();
  const { profile } = shop;
  const primary = profile.primaryColor;
  const onPrimary = readableOn(primary);
  const logo = await logoImage(profile.logo);

  const win = { x: 48, y: 44, w: MOCKUP_WIDTH_PX - 96, h: MOCKUP_HEIGHT_PX - 70 };
  const headerY = win.y + 52;
  const logoX = win.x + 36;
  const logoSvg = logo
    ? `${logoPlate ? `<rect x="${logoX - 12}" y="${headerY + 14}" width="${logo.width + 24}" height="${LOGO_HEIGHT_PX + 16}" rx="12" fill="${logoPlate}"/>` : ""}<image x="${logoX}" y="${headerY + 22}" width="${logo.width}" height="${LOGO_HEIGHT_PX}" href="${logo.href}" preserveAspectRatio="xMinYMid meet"/>`
    : text(fonts, profile.name.slice(0, 28), 28, true, logoX, headerY + 54, primary);

  const ctaW = 170;
  const ctaX = win.x + win.w - ctaW - 32;
  const badge = { ...createBadgeDocument(["Anna Lindqvist", "Säljare"]), materialId: "brass" as const, colorId: "brass-gold" };
  const badgeW = 420;
  const badgeH = (badgeW * badge.size.heightMm) / badge.size.widthMm;
  const badgeX = win.x + win.w - badgeW - 64;
  const badgeY = win.y + 250;
  const badgeSvg = renderBadgeSvg(badge, layoutBadge(badge, fonts), { mode: "preview", fonts, idPrefix: "mockup" }).replace(
    "<svg ",
    `<svg x="${badgeX}" y="${badgeY}" width="${badgeW}" height="${badgeH}" `,
  );

  const eyebrow = `GRAVERADE NAMNSKYLTAR FRÅN ${profile.name.toUpperCase()}`;
  const textX = win.x + 56;
  const inputY = win.y + 430;

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${MOCKUP_WIDTH_PX}" height="${MOCKUP_HEIGHT_PX}" viewBox="0 0 ${MOCKUP_WIDTH_PX} ${MOCKUP_HEIGHT_PX}">`,
    `<defs>`,
    `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${tint(primary, 0.82)}"/><stop offset="1" stop-color="${tint(profile.accentColor, 0.86)}"/></linearGradient>`,
    `<radialGradient id="glow" cx="30%" cy="30%" r="60%"><stop offset="0" stop-color="${tint(primary, 0.88)}"/><stop offset="1" stop-color="#ffffff"/></radialGradient>`,
    `<filter id="shadow" x="-10%" y="-10%" width="120%" height="130%"><feGaussianBlur stdDeviation="18"/></filter>`,
    `<filter id="soft" x="-30%" y="-60%" width="160%" height="260%"><feGaussianBlur stdDeviation="16"/></filter>`,
    `<clipPath id="win"><rect x="${win.x}" y="${win.y}" width="${win.w}" height="${win.h}" rx="22"/></clipPath>`,
    `</defs>`,
    `<rect width="100%" height="100%" fill="url(#bg)"/>`,
    `<rect x="${win.x + 10}" y="${win.y + 26}" width="${win.w - 20}" height="${win.h - 10}" rx="22" fill="#0b1f3a" fill-opacity=".22" filter="url(#shadow)"/>`,
    `<g clip-path="url(#win)">`,
    `<rect x="${win.x}" y="${win.y}" width="${win.w}" height="${win.h}" fill="url(#glow)"/>`,
    `<rect x="${win.x}" y="${win.y}" width="${win.w}" height="52" fill="#f3f3f1"/>`,
    ...[0, 1, 2].map((i) => `<circle cx="${win.x + 28 + i * 20}" cy="${win.y + 26}" r="6" fill="${["#ff5f57", "#febc2e", "#28c840"][i]}"/>`),
    `<rect x="${win.x + 300}" y="${win.y + 13}" width="${win.w - 600}" height="26" rx="13" fill="#ffffff"/>`,
    text(fonts, `${(profile.website || "namnskylt.com").replace(/\/+$/, "")}/namnskyltar`.slice(0, 44), 13, false, win.x + 320, win.y + 31, MUTED),
    `<rect x="${win.x}" y="${headerY}" width="${win.w}" height="76" fill="#ffffff" fill-opacity=".85"/>`,
    `<rect x="${win.x}" y="${headerY + 75}" width="${win.w}" height="1" fill="#0a0a0b" fill-opacity=".08"/>`,
    logoSvg,
    `<rect x="${ctaX}" y="${headerY + 18}" width="${ctaW}" height="40" rx="20" fill="${primary}"/>`,
    text(fonts, "Skapa skylt", 17, true, ctaX + (ctaW - fonts.measure("Skapa skylt", { fontId: "arial", bold: true, sizeMm: 17 })) / 2, headerY + 44, onPrimary),
    text(fonts, eyebrow.length > MAX_EYEBROW_CHARS + 27 ? `${eyebrow.slice(0, MAX_EYEBROW_CHARS + 26)}…` : eyebrow, 13, true, textX, win.y + 190, primary),
    text(fonts, "Skriv ditt namn.", 50, true, textX, win.y + 250, INK),
    text(fonts, "Vi graverar resten.", 50, true, textX, win.y + 308, primary),
    text(fonts, "Se skylten i 3D direkt — i mässing,", 19, false, textX, win.y + 352, MUTED),
    text(fonts, "aluminium, akryl eller gravyrplast.", 19, false, textX, win.y + 378, MUTED),
    `<rect x="${textX}" y="${inputY}" width="430" height="58" rx="29" fill="#ffffff" stroke="${primary}" stroke-opacity=".5" stroke-width="2"/>`,
    text(fonts, "Anna Lindqvist, Säljare", 18, false, textX + 26, inputY + 36, INK),
    `<rect x="${textX + 278}" y="${inputY + 8}" width="144" height="42" rx="21" fill="${primary}"/>`,
    text(fonts, "Skapa skylt →", 16, true, textX + 296, inputY + 35, onPrimary),
    `<ellipse cx="${badgeX + badgeW / 2}" cy="${badgeY + badgeH + 30}" rx="${badgeW * 0.42}" ry="16" fill="#0b1f3a" fill-opacity=".28" filter="url(#soft)"/>`,
    badgeSvg,
    `</g>`,
    `</svg>`,
  ].join("");
  return new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();
}
