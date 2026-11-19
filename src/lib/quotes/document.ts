import {
  engravedRows,
  orderDesigns,
  getColor,
  getMaterial,
  mountingLabel,
  printColorLabel,
  layoutBadge,
  renderBadgeSvg,
  shapeLabel,
  type BadgeDocument,
  type FontEngine,
} from "@/engine";
import { companyFooter, DEFAULT_COMPANY, readableOn } from "@/lib/company/profile";
import type { SellerProfile } from "@/lib/company/seller";
import { deliveryLines, shippingMethodOf, shippingNote } from "@/lib/orders/delivery";
import { priceWithPricing } from "@/lib/orders/pricing";
import { QUOTE_SHOT_DESIGNS, showsElement, showsSellerLogo, type StoredQuote } from "./model";

const PROMISES = ["Korrektur innan produktion", "Leverans inom 5 arbetsdagar", "Svensk tillverkning"];

const esc = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const sek = (value: number) => `${new Intl.NumberFormat("sv-SE").format(value).replace(/\u00a0/g, " ")} kr`;
const day = (iso: string) =>
  new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Stockholm" }).format(
    new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso),
  );

function badgeSpec(quote: StoredQuote, index: number): string {
  const badge = quote.badges[index];
  if (!badge) return "";
  const shape = shapeLabel(badge);
  return [
    `${getMaterial(badge.materialId).name}, ${getColor(badge.materialId, badge.colorId).name}`,
    `${shape} ${badge.size.widthMm}×${badge.size.heightMm} mm`,
    mountingLabel(badge),
    ...(printColorLabel(badge) ? [printColorLabel(badge)] : []),
  ].join(" · ");
}

/** Det som skiljer förhandsvisningen i skyltmotorn från det färdiga dokumentet. */
export interface QuoteRenderOptions {
  /**
   * Förhandsvisningen: rubriken, hälsningen och den avslutande texten går att klicka på och
   * ändra (`data-edit`), och kunden och giltighetsdagen leder till sina fält (`data-jump`).
   */
  editable?: boolean;
  /** Platser som visas tomma i förhandsvisningen, så att säljaren kan klicka och skriva där. */
  slots?: { message?: boolean; closing?: boolean };
  /**
   * Säljarens marginal, i rutan bredvid summan (besked av ägaren 2026-11-19: "er marginal",
   * som går att ändra som i Merchin, och "syns bara för dig"). Den finns bara i
   * förhandsvisningen: det färdiga dokumentet får aldrig rutan, eftersom det går till kunden.
   */
  margin?: QuoteMargin;
}

/** Säljarens inköp och marginal på offertens varor, utan frakt. */
export interface QuoteMargin {
  purchaseSek: number;
  saleSek: number;
  marginSek: number;
  /** Marginalen i procent av kundens pris. `null` när priset är 0. */
  percent: number | null;
  /** Priset är ändrat från listpris med marginalen. */
  custom: boolean;
}

/** Texterna som står där det ännu inte finns något, i förhandsvisningen. */
const PLACEHOLDER = {
  message: "Klicka för att skriva en hälsning",
  closing: "Klicka för att skriva en avslutande text",
};

/** Bildtexterna under de små bilderna, i den ordning vinklarna tas (`QUOTE_SHOT_YAWS` i skyltmotorn). */
const ANGLE_LABELS = ["Framifrån", "Från sidan", "Baksidan"];

/** Så många skyltar ritas i rutan "Alla skyltar". Fler står i raderna under, och det sägs. */
const ALL_BADGES_MAX = 60;

/**
 * Skyltens ritning, sparad per skylt: förhandsvisningen ritas om för varje tecken säljaren
 * skriver, och en offert kan ha många namn. På servern är varje skylt ny, så inget ligger kvar.
 */
const drawings = new WeakMap<BadgeDocument, { fonts: FontEngine; svg: string }>();
function drawing(badge: BadgeDocument, fonts: FontEngine): string {
  const known = drawings.get(badge);
  if (known && known.fonts === fonts) return known.svg;
  const svg = renderBadgeSvg(badge, layoutBadge(badge, fonts), { mode: "preview", fonts });
  drawings.set(badge, { fonts, svg });
  return svg;
}

/** Det som står på skylten, som en rad: "Erik, tomtenisse". */
const badgeText = (badge: BadgeDocument) =>
  engravedRows(badge)
    .map((row) => row.text.trim())
    .filter(Boolean)
    .join(", ");

/**
 * Offertens dokument i två delar: stilen och sidans innehåll. Förhandsvisningen i skyltmotorn
 * lägger dem i sidan, och PDF:en ritas ur samma delar (`quoteHtml`), så att det säljaren ser är
 * det kunden får. Skyltarna är bilder ur 3D-vyn när offerten har dem, annars inbäddade
 * ritningar med glyferna som konturer, så inget behöver hämtas.
 */
export function quoteDocument(
  quote: StoredQuote,
  fonts: FontEngine,
  company: SellerProfile = DEFAULT_COMPANY,
  /** Färgen bakom en vit logga, så att den syns på det vita papperet. */
  logoPlate: string | null = null,
  render: QuoteRenderOptions = {},
): { css: string; body: string } {
  const primary = company.primaryColor;
  const accent = company.accentColor;
  const onPrimary = readableOn(primary);
  const editable = render.editable === true;
  const edit = (field: string) => (editable ? ` data-edit="${field}" contenteditable="true" spellcheck="false"` : "");
  const jump = (field: string) => (editable ? ` data-jump="${field}" tabindex="0" role="button"` : "");
  // Säljaren kan välja bort sin logga på offerten. Då står namnet där.
  const brand = company.logo && showsSellerLogo(quote)
    ? `<img class="logo${logoPlate ? " plate" : ""}" src="${esc(company.logo)}" alt="${esc(company.site ? "namnskylt.com" : company.name)}"${logoPlate ? ` style="background:${logoPlate}"` : ""}>`
    : `<div class="brand">${esc(company.name)}${company.tagline ? `<small>${esc(company.tagline)}</small>` : ""}</div>`;
  const footer = companyFooter(company);
  const priced = priceWithPricing(quote.badges, quote.pricing, quote.priceList, quote.shippingSek);
  const shipping = shippingNote(shippingMethodOf(quote.delivery));
  const customer = quote.customer;
  const contact = [customer.name !== customer.company ? customer.name : "", customer.email, customer.phone].filter(Boolean).join(" · ");
  const info: [string, string, string?][] = [
    ["Kund", customer.company ?? customer.name, "customer"],
    ...(customer.orgNumber ? ([["Org.nr", customer.orgNumber]] as [string, string][]) : []),
    // En kund som sparats med bara företagets namn har det som namn också, och ingen e-post: då finns ingen kontakt att visa.
    ...(contact ? ([["Kontakt", contact]] as [string, string][]) : []),
    ...(customer.address ? ([["Adress", customer.address]] as [string, string][]) : []),
    // Vart skyltarna skickas. Återförsäljarens egen adress står inte på kundens offert.
    ...(quote.delivery.to === "reseller"
      ? ([["Leverans", `Till ${company.name}`]] as [string, string][])
      : quote.delivery.address
        ? ([["Leverans", deliveryLines(quote.delivery.address).join("\n")]] as [string, string][])
        : []),
    ["Offertdatum", day(quote.sentAt ?? quote.createdAt)],
    ["Giltig till", day(quote.validUntil), "validUntil"],
  ];

  // En bild per design: skylten som visar designen, och hur många skyltar som har den.
  const designs = orderDesigns(quote.badges);
  const withAngles = showsElement(quote, "angles");
  const galleries = showsElement(quote, "pictures")
    ? designs.slice(0, Math.max(QUOTE_SHOT_DESIGNS, 6)).map((design, i) => {
        const shot = quote.shots?.[i] ?? null;
        // Äldre offerter har en enda stillbild, av den första designen.
        const single = !shot && i === 0 && designs.length === 1 ? quote.badgeShot : null;
        const main = shot
          ? `<img src="${esc(shot.main)}" alt="">`
          : single
            ? `<img src="${esc(single)}" alt="">`
            : drawing(design.doc, fonts);
        const angles =
          shot && withAngles && shot.angles.length > 0
            ? `<div class="angles">${shot.angles
                .map((angle, n) => `<figure><img src="${esc(angle)}" alt=""><figcaption>${esc(ANGLE_LABELS[n] ?? "")}</figcaption></figure>`)
                .join("")}</div>`
            : "";
        const names = quote.badges.length;
        const note =
          designs.length > 1
            ? `Design ${i + 1} · ${design.count} st`
            : names > 1
              ? `Visas med första namnet — alla ${names} namn står nedan`
              : "";
        return `<div class="gallery"><div class="hero${shot || single ? " photo" : ""}">${main}</div>${angles}${note ? `<small>${esc(note)}</small>` : ""}</div>`;
      })
    : [];
  // Alla skyltar, en ritning per namn (besked av ägaren 2026-11-19: "vill att alla skyltar ska synas på
  // offerten"). Bilderna ovan visar en skylt per design, så rutan behövs när en design har flera namn.
  const everyBadge =
    showsElement(quote, "badges") && quote.badges.length > designs.length
      ? `<div class="all"><p class="eyebrow">Alla skyltar</p><div class="allgrid">${quote.badges
          .slice(0, ALL_BADGES_MAX)
          .map((badge) => `<figure>${drawing(badge, fonts)}<figcaption>${esc(badgeText(badge) || "Utan text")}${badge.quantity > 1 ? ` · ${badge.quantity} st` : ""}</figcaption></figure>`)
          .join("")}</div>${
          quote.badges.length > ALL_BADGES_MAX ? `<small>Och ${quote.badges.length - ALL_BADGES_MAX} skyltar till. Alla står i raderna nedan.</small>` : ""
        }</div>`
      : "";
  // En design står bredvid kundens uppgifter. Flera står i en egen rad under, två i bredd.
  const beside = galleries.length === 1 ? (galleries[0] ?? "") : "";
  const below = galleries.length > 1 ? `<div class="designs">${galleries.join("")}</div>` : "";

  const rows = quote.badges
    .map((badge, i) => {
      const line = priced.lines[i];
      if (!line) return "";
      const text = badgeText(badge);
      // Listpriset stryks bara när kunden får ett lägre pris. Ett högre pris, satt med marginalen, är ingen rabatt.
      const list = line.overridden && line.unitSek < line.listUnitSek ? `<s>${esc(sek(line.listUnitSek))}</s> ` : "";
      return `<tr><td><b>${esc(text || "Utan text")}</b><div class="spec">${esc(badgeSpec(quote, i))}</div></td><td class="r">${line.quantity} st</td><td class="r">${list}${esc(sek(line.unitSek))}</td><td class="r"><b>${esc(sek(line.totalSek))}</b></td></tr>`;
    })
    .join("");

  const message =
    quote.message || (editable && render.slots?.message)
      ? `<p class="message"${edit("message")}${editable ? ` data-placeholder="${PLACEHOLDER.message}"` : ""}>${esc(quote.message ?? "")}</p>`
      : "";
  const closingText = quote.options?.closing ?? "";
  const closing =
    closingText || (editable && render.slots?.closing)
      ? `<p class="closing"${edit("closing")}${editable ? ` data-placeholder="${PLACEHOLDER.closing}"` : ""}>${esc(closingText)}</p>`
      : "";
  // Säljarens egen ruta. Den ritas bara i förhandsvisningen, aldrig i dokumentet som går till kunden.
  const margin = editable ? render.margin : undefined;
  const ore = (value: number) => `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 }).format(value).replace(/\u00a0/g, " ")} kr`;
  const privateBox = margin
    ? `<div class="private" data-private><p class="ptitle">Er marginal<span>Syns bara för dig</span></p>
<div class="prow"><span>Ert inköp</span><span>${esc(ore(margin.purchaseSek))}</span></div>
<div class="prow"><span>Kundens pris</span><span>${esc(sek(margin.saleSek))}</span></div>
<div class="prow strong${margin.marginSek < 0 ? " bad" : ""}"><span>Marginal</span><span>${esc(ore(margin.marginSek))}</span></div>
<label class="pfield"><span>Marginal i procent</span><span class="pinput"><input data-input="margin" type="number" inputmode="numeric" min="0" max="90" step="1" value="${margin.percent ?? 0}" aria-label="Marginal i procent"><span>%</span></span></label>
<p class="pnote">Ändra procenten, så räknas kundens pris om.${margin.custom ? ` <button type="button" data-action="margin-reset">Återställ till listpris</button>` : ""}</p></div>`
    : "";
  const terms = showsElement(quote, "terms")
    ? `<div class="terms">Offerten gäller till ${esc(day(quote.validUntil))}.${company.quoteTerms ? `\n${esc(company.quoteTerms)}` : ""}</div>`
    : "<div></div>";
  const seller = showsElement(quote, "seller") ? `<div class="seller">${footer.map(esc).join("<br>")}</div>` : "";

  const css = `@page{size:A4;margin:0}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0}
.page{width:210mm;min-height:297mm;padding:15mm 15mm 12mm;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;font-size:16px;line-height:normal;color:#0a0a0b;background:#fff}
.page p,.page h1,.page figure{margin:0}
.top{display:flex;justify-content:space-between;align-items:flex-start}
.logo{display:block;max-width:62mm;max-height:16mm;object-fit:contain;object-position:left top}
.logo.plate{box-sizing:content-box;padding:2.5mm 4mm;border-radius:3mm}
.brand{font-size:17px;font-weight:700;letter-spacing:-.01em}.brand small{display:block;margin-top:1mm;font-size:8.5px;font-weight:400;color:#6b7280;letter-spacing:0}
.ref{text-align:right;font-size:9px;color:#6b7280}.ref b{display:block;font-size:12px;color:${primary}}
.page .eyebrow{margin:10mm 0 0;font-size:8px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#6b7280}
.page h1{margin:2mm 0 0;font-size:25px;font-weight:700;line-height:1.1;letter-spacing:-.02em;color:${primary}}
.page .message{margin:4mm 0 0;max-width:150mm;font-size:10.5px;line-height:1.55;color:#374151;white-space:pre-line}
.grid{margin-top:7mm;display:grid;grid-template-columns:64mm 1fr;gap:7mm;align-items:start}
.grid.wide{grid-template-columns:1fr}.grid.wide .info{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm 6mm}.grid.wide .info div{margin:0}
.info{background:#f4f4f1;border-radius:12px;padding:4mm}.info div{margin:0 0 2.6mm}.info div:last-child{margin:0}
.page .k{margin:0;font-size:7.5px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em}.page .v{margin:.6mm 0 0;font-size:10px;font-weight:500;white-space:pre-line}
.designs{margin-top:5mm;display:grid;grid-template-columns:repeat(2,1fr);gap:5mm}
.gallery{display:grid;gap:2mm;break-inside:avoid}
.hero{display:grid;place-items:center;padding:6mm;border-radius:12px;background:radial-gradient(120% 90% at 50% 35%,#fbfaf7 0%,#efede6 60%,#e4e1d8 100%)}
.hero svg{width:100%;height:auto;filter:drop-shadow(0 2mm 2.5mm rgba(11,31,58,.18))}
.hero img{display:block;width:88%;max-height:56mm;object-fit:contain;filter:drop-shadow(0 3mm 3mm rgba(11,31,58,.22))}
.designs .hero{height:50mm}.designs .hero img{max-height:38mm}.designs .hero svg{max-height:38mm}
.angles{display:grid;grid-template-columns:repeat(3,1fr);gap:2mm}
.angles figure{display:grid;gap:1mm;justify-items:center;padding:2.5mm 2mm 1.5mm;border-radius:8px;background:#f4f4f1}
.angles img{display:block;width:100%;height:17mm;object-fit:contain;filter:drop-shadow(0 1.2mm 1.4mm rgba(11,31,58,.2))}
.angles figcaption{font-size:6.5px;color:#6b7280;letter-spacing:.06em;text-transform:uppercase}
.gallery small{font-size:7.5px;color:#6b7280;text-align:center}
.all{margin-top:6mm}.page .all .eyebrow{margin:0 0 2.5mm}.all small{display:block;margin-top:2mm;font-size:7.5px;color:#6b7280}
.allgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm}
.allgrid figure{display:grid;gap:1.4mm;justify-items:center;align-content:space-between;padding:3mm 2.5mm 2mm;border-radius:8px;background:#f4f4f1;break-inside:avoid}
.allgrid svg{width:100%;height:auto;max-height:30mm;filter:drop-shadow(0 1mm 1.2mm rgba(11,31,58,.16))}
.allgrid figcaption{font-size:7px;line-height:1.3;color:#374151;text-align:center}
table{margin-top:7mm;width:100%;border-collapse:collapse;font-size:9.5px}
th{text-align:left;font-weight:600;font-size:7.5px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #0000001f;padding:2mm 0}
td{padding:2.4mm 0;border-bottom:1px solid #00000012;vertical-align:top}td b{font-weight:600}
.spec{margin-top:.8mm;font-size:8.5px;color:#6b7280}.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;padding-left:4mm}
s{color:#9ca3af;font-weight:400}
.sum{margin:4mm 0 0 auto;width:78mm;font-size:10px}.sum div{display:flex;justify-content:space-between;padding:1mm 0}
.sum .disc{color:#0b7a4b}.sum .tot{margin-top:1.5mm;padding-top:2.5mm;border-top:1.5px solid ${primary};font-size:14px;font-weight:700;color:${primary}}
.sum .vat{color:#6b7280;font-size:9px}
.page .closing{margin:7mm 0 0;max-width:150mm;font-size:10.5px;line-height:1.55;color:#374151;white-space:pre-line}
.promise{margin-top:8mm;display:flex;gap:7mm;font-size:9px;font-weight:600}.promise span:before{content:"✓";margin-right:1.6mm;color:${accent}}
.accept{margin-top:6mm;padding:4mm 5mm;border-radius:12px;background:${primary};color:${onPrimary};font-size:10px}.accept b{font-size:11px}
.foot{margin-top:auto;padding-top:6mm;display:flex;justify-content:space-between;gap:8mm;font-size:7.5px;line-height:1.55;color:#9ca3af}
.foot .terms{max-width:85mm;white-space:pre-line}.foot .seller{text-align:right}${
    editable
      ? `
[data-edit]{outline:1px dashed transparent;outline-offset:1.5mm;border-radius:1mm;cursor:text;min-height:1.2em}
[data-edit]:hover{outline-color:#9ca3af}[data-edit]:focus{outline:1.5px solid ${primary}}
[data-edit]:empty::before{content:attr(data-placeholder);color:#9ca3af}
[data-jump]{cursor:pointer;outline:1px dashed transparent;outline-offset:1mm;border-radius:1mm}
[data-jump]:hover,[data-jump]:focus-visible{outline-color:#9ca3af}
.sumrow{display:flex;justify-content:space-between;align-items:flex-start;gap:8mm;margin-top:4mm}.sumrow .sum{margin:0}
.private{width:74mm;padding:3.5mm 4mm;border:1px dashed #c9a53c;border-radius:10px;background:#fffaf0;font-size:9.5px;color:#0a0a0b}
.page .ptitle{display:flex;justify-content:space-between;align-items:center;gap:3mm;margin:0 0 2mm;font-size:10.5px;font-weight:700}
.ptitle span{padding:.6mm 2mm;border-radius:99px;background:#f3e3b3;font-size:6.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#6b5312}
.prow{display:flex;justify-content:space-between;padding:.8mm 0;font-variant-numeric:tabular-nums}.prow.strong{font-weight:700;color:#0b7a4b}.prow.strong.bad{color:#b42318}
.pfield{display:flex;justify-content:space-between;align-items:center;gap:3mm;margin-top:2mm;padding-top:2mm;border-top:1px solid #0000001a;font-weight:600}
.pinput{display:inline-flex;align-items:center;gap:1mm}
.pinput input{width:15mm;padding:1.2mm 1.5mm;border:1px solid #00000033;border-radius:5px;background:#fff;font:inherit;font-weight:600;text-align:right}
.pinput input:focus{outline:1.5px solid ${primary};outline-offset:1px}
.page .pnote{margin:1.6mm 0 0;font-size:7.5px;line-height:1.45;color:#6b7280}
.pnote button{padding:0;border:0;background:none;color:${primary};font:inherit;text-decoration:underline;cursor:pointer}`
      : ""
  }`;

  const title = quote.project ?? `Namnskyltar till ${customer.company ?? customer.name}`;
  const body = `<div class="page">
<div class="top">${brand}<div class="ref">Offert<b>${esc(quote.quoteNo)}</b></div></div>
<p class="eyebrow">${quote.project ? `Offert till ${esc(customer.company ?? customer.name)}` : "Offert"}</p>
<h1${edit("project")}>${esc(title)}</h1>
${message}
<div class="grid${beside ? "" : " wide"}"><div class="info">${info.map(([k, v, to]) => `<div${to ? jump(to) : ""}><p class="k">${esc(k)}</p><p class="v">${esc(v)}</p></div>`).join("")}</div>
${beside}</div>
${below}
${everyBadge}
<table><thead><tr><th>Skylt</th><th class="r">Antal</th><th class="r">À-pris</th><th class="r">Summa</th></tr></thead><tbody>${rows}${priced.extras
    .map((e) => `<tr><td><b>${esc(e.label)}</b></td><td class="r">1 st</td><td class="r">${esc(sek(e.amountSek))}</td><td class="r"><b>${esc(sek(e.amountSek))}</b></td></tr>`)
    .join("")}</tbody></table>
${privateBox ? `<div class="sumrow">${privateBox}` : ""}<div class="sum">
${
    priced.savingsSek > 0
      ? `<div class="vat"><span>Skyltar till listpris</span><span>${esc(sek(priced.listTotalSek))}</span></div><div class="disc"><span>Rabatt ${esc(String(priced.savingsPercent).replace(".", ","))} %</span><span>−${esc(sek(priced.savingsSek))}</span></div>`
      : ""
  }
<div><span>Skyltar</span><span>${esc(sek(priced.badgesSek))}</span></div>
${priced.extras.map((e) => `<div><span>${esc(e.label)}</span><span>${esc(sek(e.amountSek))}</span></div>`).join("")}
${priced.minimumTopUpSek > 0 ? `<div><span>Upp till minsta ordervärde</span><span>${esc(sek(priced.minimumTopUpSek))}</span></div>` : ""}
${priced.shippingSek > 0 ? `<div><span>Frakt</span><span>${esc(sek(priced.shippingSek))}</span></div>` : ""}
${shipping ? `<div><span>${esc(shipping.label)}</span><span>${esc(shipping.value)}</span></div>` : ""}
<div class="tot"><span>Totalt exkl. moms</span><span>${esc(sek(priced.totalSek))}</span></div>
${
    showsElement(quote, "vat")
      ? `<div class="vat"><span>Moms 25 %</span><span>${esc(sek(priced.vatSek))}</span></div>
<div class="vat"><span>Att betala inkl. moms</span><span>${esc(sek(priced.totalInclVatSek))}</span></div>`
      : ""
  }
</div>${privateBox ? "</div>" : ""}
${closing}
${showsElement(quote, "promises") ? `<div class="promise">${PROMISES.map((p) => `<span>${esc(p)}</span>`).join("")}</div>` : ""}
${
    showsElement(quote, "accept")
      ? `<div class="accept"><b>Godkänn offerten</b> — ${
          // En offert som säljaren skickar själv har ingen länk i något mejl: kunden svarar säljaren.
          quote.emailedAt
            ? "öppna länken i mejlet och klicka ”Godkänn”, så går skyltarna till tillverkningen."
            : `svara ${esc(company.site ? "oss" : company.name)} att ni godkänner, så går skyltarna till tillverkningen.`
        }</div>`
      : ""
  }
<div class="foot">${terms}${seller}</div>
</div>`;
  return { css, body };
}

/** Offerten som fristående A4-HTML — samma dokument blir PDF:en. */
export function quoteHtml(
  quote: StoredQuote,
  fonts: FontEngine,
  company: SellerProfile = DEFAULT_COMPANY,
  logoPlate: string | null = null,
): string {
  const { css, body } = quoteDocument(quote, fonts, company, logoPlate);
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;
}
