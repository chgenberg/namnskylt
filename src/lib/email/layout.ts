/**
 * Mejlmallen: skalet och byggstenarna som alla mejl från sajten ritas med.
 * Tabeller, inbäddad stil, en kolumn på 600 px och knappar som Outlook ritar
 * med VML. Inga webbtypsnitt, inga data-URL:er (Gmail visar dem inte) och ingen
 * webp. Färgerna är sajtens: bläck på papper, med varma gråtoner.
 *
 * Utskicket till återförsäljare bygger sina egna rader på skalet. Sajtens övriga
 * mejl (offert, orderbekräftelse, fraktbesked, besked och nytt lösenord) byggs
 * av byggstenarna längre ner, så att de ser likadana ut.
 */

export const INK = "#0a0a0b";
export const MUTED = "#75746c";
export const FAINT = "#8b8a82";
const PAPER = "#f3f1ec";
const CARD = "#ffffff";
export const LINE = "#e6e3dc";
export const SANS = "Arial,Helvetica,sans-serif";
export const SERIF = "Georgia,'Times New Roman',serif";
export const MONO = "'SFMono-Regular',Menlo,Consolas,monospace";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

export function button(href: string, label: string): string {
  const h = esc(href);
  const l = esc(label);
  return `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${h}" style="height:52px;v-text-anchor:middle;width:300px;" arcsize="50%" stroke="f" fillcolor="${INK}"><w:anchorlock/><center style="color:#ffffff;font-family:${SANS};font-size:16px;font-weight:bold;">${l}</center></v:roundrect><![endif]--><!--[if !mso]><!--><a href="${h}" class="btn" style="display:inline-block;background:${INK};color:#ffffff;font-family:${SANS};font-size:16px;font-weight:bold;line-height:52px;padding:0 34px;border-radius:26px;text-decoration:none;mso-hide:all;">${l}</a><!--<![endif]-->`;
}

export interface EmailDocument {
  title: string;
  preheader: string;
  /** Rader (`<tr>`) i kortet. */
  rows: string[];
  /** Rader under kortet, i liten text. */
  footer: string[];
  /**
   * Vem mejlet kommer ifrån. Ett mejl från namnskylt.com får raden om att sajten är en del av
   * Skylt & Gravyrteknik, och deras logga längst ner (`EmailBrand.parent`). En återförsäljares mejl
   * får ingetdera.
   */
  brand?: EmailBrand;
}

/** Raden under kortet och loggan längst ner, i ett mejl från namnskylt.com. */
function parentRows(brand: EmailBrand | undefined): { line: string; logo: string } | null {
  const parent = brand?.parent;
  if (!parent) return null;
  const width = Math.round(Number(parent.logo.width)) || 1;
  const height = Math.round(Number(parent.logo.height)) || 1;
  return {
    line: `<tr><td class="pad ink" style="padding:18px 24px 0;font-family:${SANS};font-size:12px;line-height:18px;font-weight:bold;color:${INK};text-align:center;">${esc(parent.line)}</td></tr>`,
    // Plattan syns bara i mörkt läge, där den mörkblå loggan annars försvinner mot bakgrunden.
    // Loggans rutor går ända ut i hörnen, så bilden har inga rundade hörn: de skulle klippa rutorna.
    logo: `<tr><td align="center" style="padding:18px 24px 0;"><img class="paper plate" src="${esc(parent.logo.url)}" width="${width}" height="${height}" alt="${esc(parent.name)}" style="display:block;width:${width}px;height:${height}px;font-family:${SANS};font-size:12px;line-height:${height}px;color:${FAINT};"></td></tr>`,
  };
}

export function emailDocument({ title, preheader, rows, footer, brand }: EmailDocument): string {
  const parent = parentRows(brand);
  return `<!doctype html>
<html lang="sv" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(title)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%;}
img{-ms-interpolation-mode:bicubic;border:0;}
a{color:${INK};}
@media (max-width:620px){.wrap{width:100%!important}.pad{padding-left:22px!important;padding-right:22px!important}h1{font-size:25px!important;line-height:31px!important}.btn{display:block!important;text-align:center}.tile{display:block!important;width:100%!important;padding:0 0 12px!important}}
@media (max-width:620px){.actions{width:100%!important}.stack{display:block!important;width:100%!important;padding:0 0 10px!important}.stack .btn{display:block!important}.fact{font-size:14px!important}}
@media (prefers-color-scheme:dark){.bg{background:#0f1115!important}.card{background:#171a20!important}.ink{color:#f3f4f6!important}.muted{color:#a3a9b3!important}.line{border-color:#2a2f37!important}.paper{background:${PAPER}!important}.plate{padding:8px 12px!important;border-radius:8px!important}.btn-ink{background:#f3f4f6!important;color:${INK}!important}.btn-ghost{background:#171a20!important;color:#f3f4f6!important;border-color:#4a4f58!important}}
[data-ogsc] .ink{color:#f3f4f6!important}[data-ogsc] .muted{color:#a3a9b3!important}
</style>
</head>
<body class="bg" style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${PAPER};">${esc(preheader)}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" style="background:${PAPER};">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
<tr><td class="card" style="background:${CARD};border-radius:18px;overflow:hidden;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${rows.join("\n")}
</table>
</td></tr>
${parent ? parent.line : ""}
${footer.map((line) => `<tr><td class="pad muted" style="padding:14px 24px 0;font-family:${SANS};font-size:11px;line-height:17px;color:${FAINT};text-align:center;">${line}</td></tr>`).join("\n")}
${parent ? parent.logo : ""}
</table>
</td></tr>
</table>
</body>
</html>`;
}

/* ── Byggstenarna för sajtens egna mejl ── */

const LINE_STRONG = "#cfccc4";
const WHITE = "#ffffff";
const HEX = /^#[0-9a-f]{6}$/i;

/** Vem mejlet kommer ifrån, som kunden ser det överst: sajten själv eller en återförsäljare. */
export interface EmailBrand {
  /** Säljarens namn. Står som ordmärke när loggan saknas, och som loggans alt-text. */
  name: string;
  /** Loggan som PNG eller JPEG på en adress som e-postklienten når utan inloggning. Måtten är de den visas i. */
  logo: { url: string; width: number; height: number } | null;
  /** Knappens färg, som hex. */
  accent: string;
  /**
   * Bara namnskylt.com: bolaget sajten hör till, som står under kortet och med sin logga längst ner
   * (besked av ägaren 2026-11-20). En återförsäljares mejl nämner aldrig verkstaden.
   */
  parent?: { name: string; line: string; logo: { url: string; width: number; height: number } };
}

/** Sajtens logga för mejl: en PNG, eftersom Gmail och Outlook inte visar SVG. Tre gånger visningsmåtten. */
const SITE_LOGO_PATH = "/logo-namnskylt-mejl.png";
const SITE_LOGO = { width: 168, height: 32 };

/**
 * Raden som säger vem namnskylt.com hör till. Den står i varje mejl från namnskylt.com, också i
 * textversionen (`withParentLine`).
 */
export const PARENT_LINE = "namnskylt.com – en del av Skylt & Gravyrteknik AB";
/** Skylt & Gravyrtekniks logga för mejl: en PNG i tre gånger visningsmåtten, kopierad ur deras eget material. */
const PARENT_LOGO_PATH = "/logo-skyltochgravyr-mejl.png";
const PARENT_LOGO = { width: 77, height: 50 };

/**
 * namnskylt.com som avsändare: sajtens logga och bläcksvart knapp, och under kortet raden om att
 * sajten är en del av Skylt & Gravyrteknik, med deras logga längst ner. `origin` är sajtens publika adress.
 */
export function siteBrand(origin: string): EmailBrand {
  const base = origin.replace(/\/+$/, "");
  return {
    name: "namnskylt.com",
    logo: { url: `${base}${SITE_LOGO_PATH}`, ...SITE_LOGO },
    accent: INK,
    parent: { name: "Skylt & Gravyrteknik", line: PARENT_LINE, logo: { url: `${base}${PARENT_LOGO_PATH}`, ...PARENT_LOGO } },
  };
}

/** Textversionen av ett mejl, med raden om vem namnskylt.com hör till sist när mejlet kommer från sajten. */
export function withParentLine(text: string, brand: EmailBrand | undefined): string {
  return brand?.parent ? `${text}\n\n${brand.parent.line}` : text;
}

/** En säljare utan logga i mejlet: namnet som ordmärke och säljarens egen färg på knappen. */
export function nameBrand(name: string, accent: string = INK): EmailBrand {
  return { name, logo: null, accent: HEX.test(accent) ? accent : INK };
}

/** Svart eller vit text på knappen, det som syns bäst mot färgen (WCAG-luminans). */
function onColor(hex: string): string {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2) > 0.4 ? INK : WHITE;
}

const row = (content: string, padding: string, extra = "") => `<tr><td class="pad" ${extra}style="padding:${padding};">${content}</td></tr>`;

/** Överst i kortet: säljarens logga, eller namnet som ordmärke. */
export function brandRow(brand: EmailBrand): string {
  // Måtten går in i stilen som tal, aldrig som text utifrån.
  const logo = brand.logo ? { url: brand.logo.url, width: Math.round(Number(brand.logo.width)) || 1, height: Math.round(Number(brand.logo.height)) || 1 } : null;
  const mark = logo
    ? // Plattan syns bara i mörkt läge, där en mörk logga annars försvinner mot kortet.
      `<img class="paper plate" src="${esc(logo.url)}" width="${logo.width}" height="${logo.height}" alt="${esc(brand.name)}" style="display:block;width:${logo.width}px;height:${logo.height}px;border-radius:8px;font-family:${SERIF};font-size:22px;line-height:${logo.height}px;color:${INK};">`
    : `<span class="ink" style="font-family:${SERIF};font-size:24px;line-height:30px;color:${INK};">${esc(brand.name)}</span>`;
  return row(mark, "32px 36px 0");
}

/** Rubriken: en liten rad i versaler (vad mejlet gäller), rubriken och en ingress. */
export function headRow(input: { eyebrow: string; title: string; lead?: string }): string {
  const eyebrow = `<p class="muted" style="margin:0 0 10px;font-family:${MONO};font-size:11px;line-height:16px;letter-spacing:1.2px;text-transform:uppercase;color:${FAINT};">${esc(input.eyebrow)}</p>`;
  const title = `<h1 class="ink" style="margin:0;font-family:${SERIF};font-size:30px;line-height:36px;font-weight:normal;color:${INK};">${esc(input.title)}</h1>`;
  const lead = input.lead ? `<p class="ink" style="margin:14px 0 0;font-family:${SANS};font-size:16px;line-height:25px;color:${INK};">${esc(input.lead)}</p>` : "";
  return row(`${eyebrow}${title}${lead}`, "28px 36px 0");
}

/** Ett stycke löptext. Radbrytningar i texten behålls. */
export function textRow(text: string): string {
  return row(`<p class="ink" style="margin:0;font-family:${SANS};font-size:16px;line-height:25px;color:${INK};white-space:pre-line;">${esc(text)}</p>`, "16px 36px 0");
}

/** Någons egna ord, till exempel säljarens hälsning eller kundens svar: indraget, med en linje i kanten. */
export function quoteRow(text: string): string {
  return row(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="line ink" style="padding:2px 0 2px 16px;border-left:2px solid ${LINE_STRONG};font-family:${SANS};font-size:16px;line-height:25px;color:${INK};white-space:pre-line;">${esc(text)}</td></tr></table>`,
    "18px 36px 0",
  );
}

export interface EmailPicture {
  url: string;
  /** Måtten bilden visas i. Filen bör vara dubbelt så stor. */
  width: number;
  height: number;
  alt: string;
  /** Länken bilden leder till. */
  href?: string;
  /** Liten rad under bilden. */
  caption?: string;
}

/** En bild över kortets bredd, med en liten rad under. */
export function pictureRow(picture: EmailPicture): string {
  const img = `<img class="paper" src="${esc(picture.url)}" width="${picture.width}" height="${picture.height}" alt="${esc(picture.alt)}" style="display:block;width:100%;max-width:${picture.width}px;height:auto;border-radius:14px;background:${PAPER};font-family:${SANS};font-size:13px;color:${MUTED};">`;
  const linked = picture.href ? `<a href="${esc(picture.href)}" style="text-decoration:none;">${img}</a>` : img;
  const caption = picture.caption
    ? `<p class="muted" style="margin:10px 0 0;font-family:${MONO};font-size:11px;line-height:16px;color:${FAINT};">${esc(picture.caption)}</p>`
    : "";
  return row(`${linked}${caption}`, "24px 36px 0");
}

export interface EmailFact {
  label: string;
  value: string;
  /** Raden som bär summan: större och i fetstil. */
  strong?: boolean;
}

/** Uppgifter i två kolumner med tunna linjer emellan, som en specifikation. */
export function factsRow(facts: readonly EmailFact[]): string {
  const cell = `padding:11px 0;border-top:1px solid ${LINE};font-family:${SANS};`;
  const lines = facts
    .map(
      (fact) =>
        `<tr><td class="line muted fact" style="${cell}font-size:15px;line-height:22px;color:${MUTED};">${esc(fact.label)}</td>` +
        `<td class="line ink fact" align="right" style="${cell}font-size:${fact.strong ? 17 : 15}px;line-height:22px;color:${INK};text-align:right;${fact.strong ? "font-weight:bold;" : ""}">${esc(fact.value)}</td></tr>`,
    )
    .join("");
  return row(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="line" style="border-bottom:1px solid ${LINE};">${lines}</table>`,
    "24px 36px 0",
  );
}

/** En adress eller andra korta rader under en liten rubrik. */
export function linesRow(title: string, lines: readonly string[]): string {
  return row(
    `<p class="muted" style="margin:0 0 6px;font-family:${MONO};font-size:11px;line-height:16px;letter-spacing:1.2px;text-transform:uppercase;color:${FAINT};">${esc(title)}</p>` +
      `<p class="ink" style="margin:0;font-family:${SANS};font-size:15px;line-height:23px;color:${INK};">${lines.map(esc).join("<br>")}</p>`,
    "22px 36px 0",
  );
}

export interface EmailAction {
  href: string;
  label: string;
  /** `primary` är fylld i säljarens färg, `secondary` har bara en kant. */
  kind?: "primary" | "secondary";
}

const ACTION_HEIGHT = 50;

function actionButton(action: EmailAction, brand: EmailBrand): string {
  const h = esc(action.href);
  const l = esc(action.label);
  const primary = action.kind !== "secondary";
  // Färgen kommer ur en säljares inställningar och går rakt in i stilen: bara en hexkod släpps igenom.
  const accent = HEX.test(brand.accent) ? brand.accent.toLowerCase() : INK;
  const background = primary ? accent : WHITE;
  const color = primary ? onColor(accent) : INK;
  const border = primary ? accent : LINE_STRONG;
  // Bara den bläcksvarta knappen vänds i mörkt läge. En säljares egen färg står kvar som den är.
  const tone = primary ? (accent === INK ? " btn-ink" : "") : " btn-ghost";
  const width = Math.max(150, Math.min(280, l.length * 9 + 64));
  const vml = `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${h}" style="height:${ACTION_HEIGHT}px;v-text-anchor:middle;width:${width}px;" arcsize="50%" ${primary ? 'stroke="f"' : `strokecolor="${LINE_STRONG}"`} fillcolor="${background}"><w:anchorlock/><center style="color:${color};font-family:${SANS};font-size:16px;font-weight:bold;">${l}</center></v:roundrect><![endif]-->`;
  const link = `<!--[if !mso]><!--><a href="${h}" class="btn${tone}" style="display:inline-block;background:${background};color:${color};border:1px solid ${border};font-family:${SANS};font-size:16px;font-weight:bold;line-height:${ACTION_HEIGHT - 2}px;padding:0 28px;border-radius:${ACTION_HEIGHT / 2}px;text-decoration:none;text-align:center;mso-hide:all;">${l}</a><!--<![endif]-->`;
  return `${vml}${link}`;
}

/** Mejlets knappar, bredvid varandra på en bred skärm och under varandra på en smal. */
export function actionsRow(actions: readonly EmailAction[], brand: EmailBrand): string {
  const cells = actions.map((action, i) => `<td class="stack" style="padding:0 ${i < actions.length - 1 ? 10 : 0}px 0 0;">${actionButton(action, brand)}</td>`).join("");
  return row(`<table role="presentation" class="actions" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>`, "28px 36px 0");
}

/** En liten rad i grått. `html` är färdig HTML: det som kommer utifrån ska redan vara rensat med `esc`. */
export function noteRow(html: string): string {
  return row(`<p class="muted" style="margin:0;font-family:${SANS};font-size:13px;line-height:20px;color:${MUTED};">${html}</p>`, "16px 36px 0");
}

/** En länk i en liten rad, i samma grå som raden. */
export function noteLink(href: string, label: string): string {
  return `<a href="${esc(href)}" class="muted" style="color:${MUTED};text-decoration:underline;">${esc(label)}</a>`;
}

/** Avslutningen i kortet: en linje, hälsningen och vem den kommer ifrån. */
export function signatureRow(signoff: string, name: string): string {
  return row(
    `<div class="line" style="border-top:1px solid ${LINE};margin:0 0 18px;font-size:0;line-height:0;">&nbsp;</div>` +
      `<p class="muted" style="margin:0;font-family:${SANS};font-size:15px;line-height:23px;color:${MUTED};">${esc(signoff)}</p>` +
      `<p class="ink" style="margin:2px 0 0;font-family:${SERIF};font-size:19px;line-height:26px;color:${INK};">${esc(name)}</p>`,
    "30px 36px 0",
  );
}

/** Säljarens uppgifter under kortet, som en enda rad i sidfoten med radbrytningar emellan. */
export function footerLines(lines: readonly string[]): string[] {
  return lines.length > 0 ? [lines.map((line) => esc(line.replace(/\s+/g, " ").trim())).join("<br>")] : [];
}

/** Luft i kortets nederkant. Läggs sist bland raderna. */
export const END_ROW = `<tr><td style="padding:0 0 34px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
