import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createBadgeDocument, toOfferedDocument } from "../src/engine";
import type { EmailMessage } from "../src/lib/email";
import { nameBrand, siteBrand, type EmailBrand } from "../src/lib/email/layout";
import { composeNoticeEmail } from "../src/lib/notices/email";
import type { PanelNotice } from "../src/lib/notices/model";
import { composeOrderConfirmation, composeShippedEmail } from "../src/lib/orders/confirmation-email";
import { renderMailBadge } from "../src/lib/quotes/mail-image";
import { composeQuoteEmail, quotePictureCaption } from "../src/lib/quotes/quote-email";
import { composeResetEmail } from "../src/lib/reseller-auth/reset-email";

/**
 * Skriver sajtens mejl till tmp/mejl-forhandsvisning/ med påhittade uppgifter,
 * utan databas och utan nät. Öppna index.html i en webbläsare. Bilderna ligger
 * inbäddade i filerna, så förhandsvisningen fungerar innan något är i drift.
 * Inget mejl skickas.
 */

const OUT_DIR = path.join(process.cwd(), "tmp", "mejl-forhandsvisning");
const SITE = "https://www.namnskylt.com";
const QUOTE_URL = `${SITE}/offert/exempelkodexempelkod1234`;
const ORDER_URL = `${SITE}/order/exempelkod`;

const dataUrl = (png: Buffer) => `data:image/png;base64,${png.toString("base64")}`;

/** En påhittad logga åt exempelsäljaren. */
async function exampleLogo(): Promise<{ url: string; width: number; height: number }> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="88" viewBox="0 0 320 88"><rect width="88" height="88" rx="20" fill="#7a1f2b"/><path d="M26 62V26h14l8 22 8-22h14v36H58V40l-7 22h-6l-7-22v22z" fill="#fff"/><text x="104" y="56" font-family="Georgia,serif" font-size="34" fill="#2b2a27">Profilhuset</text></svg>`;
  return { url: dataUrl(await sharp(Buffer.from(svg)).png().toBuffer()), width: 160, height: 44 };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const siteLogo = dataUrl(await readFile(path.join(process.cwd(), "public", "logo-namnskylt-mejl.png")));
  const site: EmailBrand = { ...siteBrand(SITE), logo: { url: siteLogo, width: 168, height: 32 } };
  const reseller: EmailBrand = { name: "Profilhuset i Göteborg AB", logo: await exampleLogo(), accent: "#7a1f2b" };

  const metal = { ...toOfferedDocument(createBadgeDocument(["Anna Lindqvist", "Projektledare"])), quantity: 1 };
  const plastic = { ...toOfferedDocument({ ...createBadgeDocument(["Erik Sund", "Butikschef"]), materialId: "plastic" }), quantity: 1 };
  const picture = async (badges: (typeof metal)[]) => ({ url: dataUrl(await renderMailBadge(badges[0] ?? metal)), caption: quotePictureCaption(badges) });

  const quote = {
    quoteNo: "OF-1024",
    customerName: "Karin Berg",
    customerEmail: "karin@hotellkronan.example",
    validUntil: "2026-12-18",
    url: QUOTE_URL,
    sentAt: "2026-11-18T15:43:00.000Z",
  };
  const workshopFooter = ["Skylt & Gravyrteknik i Sverige AB · Org.nr 556464-2261", "F O Petersons gata 28, 421 31 Västra Frölunda", "031-709 02 92 · order@skyltochgravyr.com · namnskylt.com"];
  const resellerFooter = ["Profilhuset i Göteborg AB · Org.nr 556123-4567", "Storgatan 1, 411 01 Göteborg", "031-123 45 67 · kontakt@profilhuset.example · profilhuset.example"];

  const notice = (kind: PanelNotice["kind"], detail: string | null): PanelNotice => ({
    id: "exempel",
    kind,
    who: "Hotell Kronan AB",
    detail,
    quoteNo: "OF-1024",
    orderNo: null,
    createdAt: "2026-11-18T15:43:00.000Z",
  });
  const noticeSettings = { from: "namnskylt.com <besked@namnskylt.com>", replyTo: "besked@namnskylt.com", origin: SITE };
  const withSiteLogo = (message: EmailMessage): EmailMessage => ({ ...message, html: message.html.split(`${SITE}/logo-namnskylt-mejl.png`).join(siteLogo) });

  const mails: { file: string; title: string; note: string; message: EmailMessage }[] = [
    {
      file: "offert-namnskylt",
      title: "Offert från namnskylt.com",
      note: "Offerten som admin skickar: sajtens logga, Skylt & Gravyrtekniks uppgifter.",
      message: composeQuoteEmail(
        { ...quote, project: "Skyltar till receptionen", quantity: 12, totalSek: 2055, totalInclVatSek: 2569, shippingPending: false, message: null, picture: await picture([metal, metal, metal]) },
        { sellerName: "Skylt & Gravyrteknik", replyTo: "order@skyltochgravyr.com", fromAddress: "offert@skyltochgravyr.com", footer: workshopFooter, brand: site },
      ),
    },
    {
      file: "offert-aterforsaljare",
      title: "Offert från en återförsäljare, med logga",
      note: "Återförsäljarens logga och färg, och säljarens egen hälsning till kunden.",
      message: composeQuoteEmail(
        { ...quote, quoteNo: "OF-1031", project: null, quantity: 1, totalSek: 402, totalInclVatSek: 503, shippingPending: false, message: "Hej Karin!\nHär kommer offerten vi pratade om i går. Hör av dig om något ska ändras.", picture: await picture([plastic]) },
        { sellerName: "Profilhuset i Göteborg AB", replyTo: "kontakt@profilhuset.example", fromAddress: "offert@skyltochgravyr.com", footer: resellerFooter, brand: reseller },
      ),
    },
    {
      file: "offert-utan-logga",
      title: "Offert från en återförsäljare, utan logga och bild",
      note: "Säljaren har ingen logga: namnet står som ordmärke. Så ser mejlet också ut när bilder är avstängda.",
      message: composeQuoteEmail(
        { ...quote, quoteNo: "OF-1032", project: "Namnskyltar till butiken", quantity: 40, totalSek: 5120, totalInclVatSek: 6400, shippingPending: true, message: null, picture: null },
        { sellerName: "Reklamhuset i Norr", replyTo: "info@reklamhuset.example", fromAddress: "offert@skyltochgravyr.com", footer: ["Reklamhuset i Norr · Org.nr 556987-6543", "Norra vägen 3, 901 01 Umeå"], brand: nameBrand("Reklamhuset i Norr", "#0b5d4b") },
      ),
    },
    {
      file: "orderbekraftelse",
      title: "Orderbekräftelse (avstängd)",
      note: "Skickas inte i dag. Sajtens egna mejl är avstängda.",
      message: withSiteLogo(
        composeOrderConfirmation(
          {
            orderNo: "NS-1107",
            customerName: "Karin Berg",
            customerEmail: "karin@hotellkronan.example",
            quantity: 12,
            goodsSek: 1896,
            shippingSek: 159,
            delivery: {
              to: "customer",
              method: "standard",
              address: { name: "Hotell Kronan AB", contactName: "Karin Berg", line1: "Kungsgatan 12", line2: null, zip: "411 19", city: "Göteborg", country: "SE", phone: "031-000 00 00" },
            },
            payment: null,
            orderUrl: ORDER_URL,
          },
          { sellerName: "Skylt & Gravyrteknik", replyTo: "order@skyltochgravyr.com", fromAddress: "order@namnskylt.com", termsUrl: `${SITE}/villkor`, brand: site },
        ),
      ),
    },
    {
      file: "fraktbesked",
      title: "Fraktbesked (avstängt)",
      note: "Skickas inte i dag.",
      message: composeShippedEmail(
        { orderNo: "NS-1107", customerName: "Karin Berg", customerEmail: "karin@hotellkronan.example", trackingUrl: "https://tracking.postnord.com/se/?id=EXEMPEL", orderUrl: ORDER_URL },
        { sellerName: "Skylt & Gravyrteknik", replyTo: "order@skyltochgravyr.com", fromAddress: "order@namnskylt.com", brand: site },
      ),
    },
    {
      file: "besked",
      title: "Besked till panelens ägare (avstängt)",
      note: "Skickas inte i dag. Går till återförsäljaren när en kund har svarat.",
      message: withSiteLogo(composeNoticeEmail(notice("quote-declined", "För dyrt just nu, vi återkommer efter årsskiftet."), "saljare@profilhuset.example", noticeSettings)),
    },
    {
      file: "nytt-losenord",
      title: "Nytt lösenord (avstängt)",
      note: "Skickas inte i dag. Går till en återförsäljare som har glömt sitt lösenord.",
      message: withSiteLogo(composeResetEmail({ to: "saljare@profilhuset.example", url: `${SITE}/aterforsaljare/konto/exempelkodexempelkodexempelkod12`, from: noticeSettings.from, replyTo: noticeSettings.replyTo })),
    },
  ];

  for (const mail of mails) {
    await writeFile(path.join(OUT_DIR, `${mail.file}.html`), mail.message.html);
    await writeFile(path.join(OUT_DIR, `${mail.file}.txt`), `Från: ${mail.message.from}\nSvar till: ${mail.message.replyTo}\nÄmne: ${mail.message.subject}\n\n${mail.message.text}\n`);
  }
  const index = `<!doctype html><html lang="sv"><meta charset="utf-8"><title>Mejlen från namnskylt.com</title><body style="margin:40px;font-family:system-ui,sans-serif;color:#0a0a0b;background:#f4f2ec"><h1 style="font-family:Georgia,serif;font-weight:normal">Mejlen från namnskylt.com</h1><p>Påhittade uppgifter. Inget skickas.</p><ul style="line-height:1.9">${mails
    .map((mail) => `<li><a href="${mail.file}.html">${mail.title}</a> (<a href="${mail.file}.txt">som text</a>)<br><span style="color:#75746c">${mail.note} Ämne: ${mail.message.subject}</span></li>`)
    .join("")}</ul></body></html>`;
  await writeFile(path.join(OUT_DIR, "index.html"), index);
  console.log(`Skrev ${mails.length} mejl till ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
