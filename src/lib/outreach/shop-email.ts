import { readableOn, type CompanyProfile } from "@/lib/company/profile";
import type { Shop } from "@/lib/shops/model";

/**
 * Mejlet till en återförsäljare om deras färdiga demobutik. Byggt för
 * e-postklienter, inte webbläsare: tabeller, inbäddad stil, bilder som
 * adresser (Gmail visar inte data-URL:er) och en knapp som håller i Outlook.
 */
export interface ShopEmailInput {
  shop: Shop;
  shopUrl: string;
  /** Den personliga bilden av butiken, som absolut adress. */
  mockupUrl: string;
  logoUrl: string | null;
  /** Bakgrund bakom en vit logga; `null` = loggan syns på vitt. */
  logoPlate: string | null;
  sender: CompanyProfile;
  /** Adress för avregistrering — Resend fyller i den riktiga vid utskick. */
  unsubscribeUrl: string;
}

export interface ShopEmail {
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

const esc = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** UTM-taggar så att varje klick syns per butik i statistiken. */
function tracked(url: string, slug: string, content: string): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", "aterforsaljarmejl");
  u.searchParams.set("utm_medium", "email");
  u.searchParams.set("utm_campaign", "demobutik");
  u.searchParams.set("utm_content", `${slug}-${content}`);
  return u.toString();
}

const STEPS = [
  ["Er logga, era färger", "Butiken ser ut som er egen — kunderna ser aldrig vårt namn."],
  ["Skyltmotor i 3D", "Kunden skriver namnet, väljer material och ser skylten graveras fram direkt."],
  ["Vi tillverkar, ni säljer", "Ingen maskin, inget lager. Vi graverar i Sverige och skickar inom fem arbetsdagar."],
] as const;

/** Knapp som Outlook ritar med VML och alla andra med en vanlig länk. */
function button(href: string, label: string, color: string): string {
  const fg = readableOn(color);
  return `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(href)}" style="height:52px;v-text-anchor:middle;width:280px;" arcsize="50%" stroke="f" fillcolor="${color}"><w:anchorlock/><center style="color:${fg};font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${esc(label)}</center></v:roundrect><![endif]--><!--[if !mso]><!--><a href="${esc(href)}" class="btn" style="display:inline-block;background:${color};color:${fg};font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;line-height:52px;padding:0 34px;border-radius:26px;text-decoration:none;mso-hide:all;">${esc(label)}</a><!--<![endif]-->`;
}

export function buildShopEmail(input: ShopEmailInput): ShopEmail {
  const { shop, sender } = input;
  const name = shop.profile.name;
  const primary = shop.profile.primaryColor;
  const accent = shop.profile.accentColor;
  const cta = tracked(input.shopUrl, shop.slug, "knapp");
  const imageLink = tracked(input.shopUrl, shop.slug, "bild");
  const subject = `${name}, er egen namnskyltsbutik är redan byggd`;
  const preheader = `Med er logga och era färger — öppna den och prova skyltmotorn i 3D. Klar att sälja från i dag.`;
  const signature = [sender.name, sender.phone, sender.email].filter(Boolean).join(" · ");

  const logo = input.logoUrl
    ? `<img src="${esc(input.logoUrl)}" alt="${esc(name)}" height="40" style="display:block;height:40px;width:auto;max-width:200px;border:0;${
        input.logoPlate ? `background:${input.logoPlate};padding:8px 14px;border-radius:10px;` : ""
      }">`
    : `<span style="font-size:20px;font-weight:bold;color:${primary};">${esc(name)}</span>`;

  const steps = STEPS.map(
    ([title, text], i) => `<tr><td valign="top" width="44" style="padding:0 0 18px;"><div style="width:32px;height:32px;line-height:32px;border-radius:16px;background:${primary};color:${readableOn(primary)};text-align:center;font-weight:bold;font-size:14px;">${i + 1}</div></td><td valign="top" style="padding:0 0 18px;"><p class="ink" style="margin:0;font-size:16px;font-weight:bold;color:#0a0a0b;">${esc(title)}</p><p class="muted" style="margin:4px 0 0;font-size:14px;line-height:21px;color:#5b616b;">${esc(text)}</p></td></tr>`,
  ).join("");

  const html = `<!doctype html>
<html lang="sv" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%;}
img{-ms-interpolation-mode:bicubic;}
a{color:${primary};}
@media (max-width:620px){.wrap{width:100%!important}.pad{padding-left:22px!important;padding-right:22px!important}h1{font-size:26px!important;line-height:32px!important}.btn{display:block!important;text-align:center}}
@media (prefers-color-scheme:dark){.bg{background:#0f1115!important}.card{background:#171a20!important}.ink{color:#f3f4f6!important}.muted{color:#a3a9b3!important}.line{border-color:#2a2f37!important}}
[data-ogsc] .ink{color:#f3f4f6!important}[data-ogsc] .muted{color:#a3a9b3!important}
</style>
</head>
<body class="bg" style="margin:0;padding:0;background:#f2f1ec;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f2f1ec;">${esc(preheader)}${"&#847;&zwnj;&nbsp;".repeat(60)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" style="background:#f2f1ec;">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
<tr><td class="pad muted" style="padding:0 8px 18px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8a9099;">Personligt till ${esc(name)} · <a href="${esc(cta)}" style="color:#8a9099;">Öppna i webbläsaren</a></td></tr>
<tr><td class="card" style="background:#ffffff;border-radius:22px;overflow:hidden;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="height:6px;background:${primary};background-image:linear-gradient(90deg,${primary},${accent});font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td class="pad" align="left" style="padding:30px 40px 6px;">${logo}</td></tr>
<tr><td class="pad" style="padding:18px 40px 0;font-family:Arial,Helvetica,sans-serif;">
<p class="muted" style="margin:0 0 8px;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${primary};">Er demobutik är klar</p>
<h1 class="ink" style="margin:0;font-size:32px;line-height:38px;font-weight:bold;color:#0a0a0b;">Hej ${esc(name)}! Vi har byggt er en egen webbutik för namnskyltar.</h1>
<p class="muted" style="margin:16px 0 0;font-size:16px;line-height:25px;color:#454b54;">Med er logga, era färger och er kontaktinfo — och med vår skyltmotor inbyggd, där kunden skriver namnet och ser skylten i 3D innan den beställs. Den ligger redo att prova, helt utan att ni behövt göra något.</p>
</td></tr>
<tr><td style="padding:26px 24px 6px;" align="center"><a href="${esc(imageLink)}" style="text-decoration:none;"><img src="${esc(input.mockupUrl)}" width="552" alt="Förhandsvisning av ${esc(name)}s namnskyltsbutik med er logga och era färger" style="display:block;width:100%;max-width:552px;height:auto;border:0;border-radius:14px;"></a></td></tr>
<tr><td class="pad" align="center" style="padding:24px 40px 8px;">${button(cta, "Öppna er butik →", primary)}</td></tr>
<tr><td class="pad muted" align="center" style="padding:6px 40px 26px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#8a9099;"><a href="${esc(cta)}" style="color:#8a9099;word-break:break-all;">${esc(input.shopUrl.replace(/^https?:\/\//, ""))}</a></td></tr>
<tr><td class="pad" style="padding:0 40px;"><div class="line" style="border-top:1px solid #ecebe6;font-size:0;line-height:0;">&nbsp;</div></td></tr>
<tr><td class="pad" style="padding:26px 40px 8px;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${steps}</table>
</td></tr>
<tr><td class="pad" style="padding:0 40px 32px;font-family:Arial,Helvetica,sans-serif;">
<p class="muted" style="margin:0;font-size:15px;line-height:24px;color:#454b54;">Vill ni ha den på er egen domän, egna priser eller att ordrarna går direkt till er? Svara bara på det här mejlet så ordnar vi det på en dag.</p>
<p class="ink" style="margin:18px 0 0;font-size:15px;line-height:22px;color:#0a0a0b;">Vänliga hälsningar<br><strong>${esc(sender.name)}</strong></p>
${signature ? `<p class="muted" style="margin:4px 0 0;font-size:13px;color:#8a9099;">${esc(signature)}</p>` : ""}
</td></tr>
</table>
</td></tr>
<tr><td class="pad muted" style="padding:20px 18px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:17px;color:#9aa0a8;text-align:center;">Ni får det här mejlet eftersom ${esc(name)} säljer profilprodukter till företag. Butiken är en privat demo och syns inte i sökmotorer.<br><a href="${esc(input.unsubscribeUrl)}" style="color:#9aa0a8;">Vill inte ha fler mejl</a>${
    sender.address ? ` · ${esc(sender.address.replace(/\s*\n\s*/g, ", "))}` : ""
  }</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    `Hej ${name}!`,
    "",
    "Vi har byggt er en egen webbutik för namnskyltar — med er logga, era färger och vår skyltmotor i 3D.",
    "",
    `Öppna er butik: ${cta}`,
    "",
    ...STEPS.map(([title, body], i) => `${i + 1}. ${title} — ${body}`),
    "",
    "Vill ni ha den på er egen domän, egna priser eller att ordrarna går direkt till er? Svara bara på mejlet.",
    "",
    "Vänliga hälsningar",
    sender.name,
    signature,
    "",
    `Vill inte ha fler mejl: ${input.unsubscribeUrl}`,
  ].join("\n");

  return { subject, preheader, html, text };
}

/** Det mejlet använder — visas i förhandsvisningen. */
export const EMAIL_TECHNIQUES = [
  ["Förhandstext", "Raden som syns efter ämnet i inkorgen, dold i själva mejlet."],
  ["Personlig bild", "Butiken ritad med deras logga och färger, en bild per återförsäljare."],
  ["Mörkt läge", "Egna färger för Apple Mail, Gmail och Outlook i mörkt läge."],
  ["Knapp för Outlook", "VML-knapp i Outlooks färg, vanlig länk överallt annars."],
  ["Mobilanpassat", "En kolumn som krymper till skärmen; knappen blir fullbredd."],
  ["Spårning per butik", "UTM-taggar per återförsäljare, plus Resends öppningar och klick."],
  ["Avregistrering i ett klick", "List-Unsubscribe-header (RFC 8058) som Gmail och Yahoo kräver."],
  ["Textversion", "Ren text för klienter och filter som inte läser HTML."],
] as const;
