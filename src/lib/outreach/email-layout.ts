/**
 * Skalet för mejl till e-postklienter: tabeller, inbäddad stil, en kolumn på
 * 600 px och en knapp som Outlook ritar med VML. Inga webbtypsnitt, inga
 * data-URL:er (Gmail visar dem inte) och ingen webp.
 */

export const INK = "#0a0a0b";
export const MUTED = "#5b616b";
export const FAINT = "#8a9099";
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
}

export function emailDocument({ title, preheader, rows, footer }: EmailDocument): string {
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
@media (prefers-color-scheme:dark){.bg{background:#0f1115!important}.card{background:#171a20!important}.ink{color:#f3f4f6!important}.muted{color:#a3a9b3!important}.line{border-color:#2a2f37!important}.paper{background:${PAPER}!important}}
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
${footer.map((line) => `<tr><td class="pad muted" style="padding:14px 24px 0;font-family:${SANS};font-size:11px;line-height:17px;color:${FAINT};text-align:center;">${line}</td></tr>`).join("\n")}
</table>
</td></tr>
</table>
</body>
</html>`;
}
