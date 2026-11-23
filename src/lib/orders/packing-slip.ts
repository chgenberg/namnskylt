import { getColor, getMaterial, mountingLabel, orderDesigns, sameDesign, shapeLabel, type BadgeDocument } from "@/engine";
import type { SellerProfile } from "@/lib/company/seller";
import { formatDay } from "@/lib/format";
import { badgeText } from "@/lib/quotes/view";
import type { SupplierDelivery } from "@/lib/supplier/types";
import { deliveryLines, shippingMethodOf, type Delivery } from "./delivery";
import { customerOrderNumber } from "./model";
import { deliveryBadges, supplierDeliveryLines } from "./supplier-deliveries";

/**
 * Följesedeln som läggs i paketet (beslut av ägaren 2026-11-20, efter mötet med verkstaden):
 * säljarens logga och uppgifter, vad som ligger i paketet och vart det ska, utan priser.
 * Verkstaden öppnar den via en kort länk på sitt orderpapper och skriver ut den.
 *
 * Säljaren är den kunden köpte av: en återförsäljares följesedel bär återförsäljarens logga och
 * nämner varken namnskylt.com eller verkstaden. Hos namnskylt.com bär den sajtens logga och
 * Skylt & Gravyrtekniks uppgifter, som övriga sidor kunden möter (`getSellerProfile`).
 */

/** Följesedelns sökväg på sajten. */
export function packingSlipPath(code: string): string {
  return `/f/${code}`;
}

/**
 * Länken som står på verkstadens orderpapper: utan `https://`, så att den är kort att läsa och
 * skriva av. Webbläsaren lägger till resten.
 */
export function packingSlipLink(origin: string, code: string): string {
  return `${origin.replace(/^https?:\/\//, "").replace(/\/+$/, "")}${packingSlipPath(code)}`;
}

/** Hur verkstaden ska packa ordern, som en rad på orderpappret. Följesedelns logga säger samma sak. */
export function packingInstruction(ownSale: boolean): string {
  return ownSale
    ? "namnskylt.com: vår följesedel och våra klistermärken"
    : "Neutralt: återförsäljarens följesedel, inga egna loggor eller klistermärken";
}

export interface PackingSlipOrder {
  orderNo: string;
  resellerId: string;
  demo: boolean;
  payment?: unknown;
  supplierOrderNo: string | null;
  supplierSentAt: string | null;
  /** När ordern lades. */
  placedAt: string;
  project: string | null;
  customerPo: string | null;
  customer: { name: string; company: string | null };
  delivery: Delivery | null;
  badges: readonly BadgeDocument[];
  /** Leveranserna när verkstaden har delat ordern på flera adresser. */
  supplierDeliveries?: readonly SupplierDelivery[];
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (value: string) => value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

/** "Metall · Mässing · Rektangel 60 × 30 mm · Magnet": det som skiljer en design från en annan i paketet. */
function designLine(doc: BadgeDocument): string {
  const size = `${doc.size.widthMm.toLocaleString("sv-SE")} × ${doc.size.heightMm.toLocaleString("sv-SE")} mm`;
  return [getMaterial(doc.materialId).name, getColor(doc.materialId, doc.colorId).name, `${shapeLabel(doc)} ${size}`, mountingLabel(doc)].join(" · ");
}

/** Säljarens uppgifter i sidfoten. Bankgirot hör till en faktura, inte hit. */
function sellerLines(seller: SellerProfile): string[] {
  return [
    [seller.legalName || seller.name, seller.orgNumber && `Org.nr ${seller.orgNumber}`].filter(Boolean).join(" · "),
    seller.address.replace(/\s*\n\s*/g, ", "),
    [seller.phone, seller.email, seller.website].filter(Boolean).join(" · "),
  ].filter(Boolean);
}

/** Vart paketet ska, som rader. Upphämtning och en order utan adress har ingen adress att skriva. */
function recipientLines(order: PackingSlipOrder): string[] {
  if (!order.delivery) return ["Leveransadress saknas"];
  if (shippingMethodOf(order.delivery) === "pickup") return ["Hämtas av kunden", order.customer.company ?? order.customer.name];
  return deliveryLines(order.delivery.address);
}

/**
 * Följesedeln som en fristående sida för utskrift på A4. Skyltarna står design för design, med
 * namnen under. `seller.logo` ska vara data (som i offertens PDF), eftersom sidan ritas utan
 * tillgång till sajten. `plate` är färgen bakom en ljus logga.
 */
export function packingSlipHtml(
  order: PackingSlipOrder,
  seller: SellerProfile,
  plate: string | null = null,
  /** Leveransens nummer, för följesedeln till en av leveranserna i en uppdelad order. */
  position: number | null = null,
): string {
  const number = customerOrderNumber(order);
  const sellerName = seller.site ? "namnskylt.com" : seller.name;
  const brand = seller.logo
    ? `<img class="logo${plate ? " plate" : ""}" src="${esc(seller.logo)}" alt="${esc(sellerName)}"${plate ? ` style="background:${esc(plate)}"` : ""}>`
    : `<span class="name">${esc(sellerName)}</span>`;
  const deliveries = order.supplierDeliveries ?? [];
  // En uppdelad order har en följesedel per leverans. Utan nummer blir det alla, en per sida.
  const parts: (SupplierDelivery | null)[] =
    deliveries.length > 1
      ? position === null
        ? [...deliveries]
        : deliveries.filter((delivery) => delivery.position === position)
      : [null];
  const pages = parts.map((part) => slipPage(order, number, brand, seller, part, deliveries.length)).join('<div class="page-break"></div>');
  return `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<title>Följesedel ${esc(number.number)}</title>
<style>
@page{size:A4;margin:16mm 16mm 18mm}
*{box-sizing:border-box}
body{margin:0;font-family:Helvetica,Arial,sans-serif;font-size:10.5pt;line-height:1.45;color:#0a0a0b}
header{display:flex;justify-content:space-between;align-items:flex-start;gap:10mm;padding-bottom:6mm;border-bottom:.3mm solid #0a0a0b}
.logo{max-height:18mm;max-width:70mm;display:block}
.logo.plate{box-sizing:content-box;padding:2.5mm 4mm;border-radius:3mm}
.name{font-family:Georgia,'Times New Roman',serif;font-size:20pt}
h1{margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22pt;font-weight:normal;text-align:right}
.facts{margin:2mm 0 0;display:grid;grid-template-columns:auto auto;gap:.5mm 5mm;justify-content:end;font-size:9.5pt}
.facts dt{color:#75746c}.facts dd{margin:0;text-align:right;font-weight:bold}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:10mm;margin-top:7mm}
.label{margin:0 0 1.5mm;font-size:8pt;letter-spacing:.12em;text-transform:uppercase;color:#75746c}
.parties p{margin:0}
.design{margin-top:8mm}
h2{display:flex;justify-content:space-between;gap:6mm;margin:0 0 2mm;font-size:10.5pt}
h2 span{white-space:nowrap}
table{width:100%;border-collapse:collapse}
th{padding:1.5mm 0;border-bottom:.3mm solid #0a0a0b;font-size:8pt;letter-spacing:.12em;text-transform:uppercase;text-align:left;color:#75746c;font-weight:normal}
td{padding:1.6mm 0;border-bottom:.2mm solid #e6e3dc;vertical-align:top}
tr{break-inside:avoid}
.qty{width:22mm;text-align:right;white-space:nowrap}
.total{display:flex;justify-content:space-between;margin-top:6mm;padding-top:3mm;border-top:.3mm solid #0a0a0b;font-weight:bold}
footer{margin-top:12mm;font-size:8.5pt;color:#75746c}
footer p{margin:0}
.page-break{break-after:page}
</style>
</head>
<body>
${pages}
</body>
</html>`;
}

/** En sida av följesedeln: hela ordern, eller en av leveranserna i en uppdelad order. */
function slipPage(
  order: PackingSlipOrder,
  number: ReturnType<typeof customerOrderNumber>,
  brand: string,
  seller: SellerProfile,
  part: SupplierDelivery | null,
  deliveryCount: number,
): string {
  const badges = part ? deliveryBadges(order.badges, part) : order.badges;
  const facts: [string, string][] = [
    ["Ordernummer", number.number],
    ...(number.reference ? ([["Referens", number.reference]] as [string, string][]) : []),
    ["Orderdatum", formatDay(order.placedAt)],
    ...(order.customerPo ? ([["Inköpsnummer", order.customerPo]] as [string, string][]) : []),
    ...(order.project ? ([["Märkning", order.project]] as [string, string][]) : []),
    ...(part ? ([["Leverans", `${part.position} av ${deliveryCount}`]] as [string, string][]) : []),
  ];
  const customer = [order.customer.company, order.customer.name].filter((line, i, all): line is string => Boolean(line) && all.indexOf(line) === i);
  const designs = orderDesigns(badges);
  const total = badges.reduce((sum, badge) => sum + badge.quantity, 0);
  const groups = designs
    .map((design, index) => {
      // Namnen i just den här designen, i orderns ordning.
      const key = designLine(design.doc);
      const rows = badges
        .filter((badge) => sameDesign([design.doc, badge]))
        .map((badge) => `<tr><td>${esc(badgeText(badge) || "Utan text")}</td><td class="qty">${badge.quantity} st</td></tr>`)
        .join("");
      return (
        `<section class="design"><h2>${designs.length > 1 ? `Design ${index + 1}: ` : ""}${esc(key)}<span>${design.count} st</span></h2>` +
        `<table><thead><tr><th>Text på skylten</th><th class="qty">Antal</th></tr></thead><tbody>${rows}</tbody></table></section>`
      );
    })
    .join("");
  const recipient = part ? supplierDeliveryLines(part) : recipientLines(order);
  return `<header>
<div>${brand}</div>
<div><h1>Följesedel</h1><dl class="facts">${facts.map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join("")}</dl></div>
</header>
<div class="parties">
<div><p class="label">Levereras till</p>${recipient.map((line) => `<p>${esc(line)}</p>`).join("")}</div>
<div><p class="label">Beställare</p>${customer.map((line) => `<p>${esc(line)}</p>`).join("")}</div>
</div>
${groups}
<div class="total"><span>Antal skyltar i leveransen</span><span>${total} st</span></div>
<footer>${sellerLines(seller).map((line) => `<p>${esc(line)}</p>`).join("")}</footer>`;
}
