import {
  engravedRows,
  getColor,
  getMaterial,
  getMounting,
  layoutBadge,
  renderBadgeSvg,
  SHAPES,
  type FontEngine,
} from "@/engine";
import { companyFooter, DEFAULT_COMPANY, readableOn, type CompanyProfile } from "@/lib/company/profile";
import { priceWithPricing } from "@/lib/orders/pricing";
import type { StoredQuote } from "./model";

const PROMISES = ["Korrektur innan gravyr", "Leverans inom 5 arbetsdagar", "Svensk tillverkning"];

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
  const shape = SHAPES.find((s) => s.id === badge.shape)?.name ?? "";
  return [
    `${getMaterial(badge.materialId).name}, ${getColor(badge.materialId, badge.colorId).name}`,
    `${shape} ${badge.size.widthMm}×${badge.size.heightMm} mm`,
    getMounting(badge.mounting).name,
  ].join(" · ");
}

/**
 * Offerten som fristående A4-HTML — samma dokument blir PDF:en. Skyltarna är
 * inbäddade SVG med glyferna som konturer, så inget behöver hämtas.
 */
export function quoteHtml(
  quote: StoredQuote,
  fonts: FontEngine,
  company: CompanyProfile = DEFAULT_COMPANY,
  /** Färgen bakom en vit logga, så att den syns på det vita papperet. */
  logoPlate: string | null = null,
): string {
  const primary = company.primaryColor;
  const accent = company.accentColor;
  const onPrimary = readableOn(primary);
  const brand = company.logo
    ? `<img class="logo${logoPlate ? " plate" : ""}" src="${esc(company.logo)}" alt="${esc(company.name)}"${logoPlate ? ` style="background:${logoPlate}"` : ""}>`
    : `<div class="brand">${esc(company.name)}${company.tagline ? `<small>${esc(company.tagline)}</small>` : ""}</div>`;
  const footer = companyFooter(company);
  const priced = priceWithPricing(quote.badges, quote.pricing);
  const customer = quote.customer;
  const info: [string, string][] = [
    ["Kund", customer.company ?? customer.name],
    ...(customer.orgNumber ? ([["Org.nr", customer.orgNumber]] as [string, string][]) : []),
    ["Kontakt", [customer.name, customer.email, customer.phone].filter(Boolean).join(" · ")],
    ...(customer.address ? ([["Adress", customer.address]] as [string, string][]) : []),
    ["Offertdatum", day(quote.sentAt ?? quote.createdAt)],
    ["Giltig till", day(quote.validUntil)],
  ];
  const svgs = quote.badges.slice(0, 6).map((badge) => renderBadgeSvg(badge, layoutBadge(badge, fonts), { mode: "preview", fonts }));
  const rows = quote.badges
    .map((badge, i) => {
      const line = priced.lines[i];
      if (!line) return "";
      const text = engravedRows(badge)
        .map((r) => r.text.trim())
        .filter(Boolean)
        .join(", ");
      const list = line.overridden ? `<s>${esc(sek(line.listUnitSek))}</s> ` : "";
      return `<tr><td><b>${esc(text || "Utan text")}</b><div class="spec">${esc(badgeSpec(quote, i))}</div></td><td class="r">${line.quantity} st</td><td class="r">${list}${esc(sek(line.unitSek))}</td><td class="r"><b>${esc(sek(line.totalSek))}</b></td></tr>`;
    })
    .join("");

  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><style>
@page{size:A4;margin:0}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;color:#0a0a0b}
.page{width:210mm;min-height:297mm;padding:15mm 15mm 12mm;display:flex;flex-direction:column}
.top{display:flex;justify-content:space-between;align-items:flex-start}
.logo{display:block;max-width:62mm;max-height:16mm;object-fit:contain;object-position:left top}
.logo.plate{box-sizing:content-box;padding:2.5mm 4mm;border-radius:3mm}
.brand{font-size:17px;font-weight:700;letter-spacing:-.01em}.brand small{display:block;margin-top:1mm;font-size:8.5px;font-weight:400;color:#6b7280;letter-spacing:0}
.ref{text-align:right;font-size:9px;color:#6b7280}.ref b{display:block;font-size:12px;color:${primary}}
.eyebrow{margin:10mm 0 0;font-size:8px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#6b7280}
h1{margin:2mm 0 0;font-size:25px;line-height:1.1;letter-spacing:-.02em;color:${primary}}
.message{margin:4mm 0 0;max-width:150mm;font-size:10.5px;line-height:1.55;color:#374151;white-space:pre-line}
.grid{margin-top:7mm;display:grid;grid-template-columns:64mm 1fr;gap:7mm;align-items:start}
.info{background:#f4f4f1;border-radius:12px;padding:4mm}.info div{margin:0 0 2.6mm}.info div:last-child{margin:0}
.k{margin:0;font-size:7.5px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em}.v{margin:.6mm 0 0;font-size:10px;font-weight:500;white-space:pre-line}
.stage{display:grid;grid-template-columns:repeat(${Math.min(2, svgs.length)},1fr);gap:4mm;padding:6mm;border-radius:12px;background:linear-gradient(180deg,#f6f5f1,#ebe9e2)}
.stage svg{width:100%;height:auto;filter:drop-shadow(0 2mm 2.5mm rgba(11,31,58,.18))}
.shot{display:grid;place-items:center;gap:2mm;padding:5mm;border-radius:12px;background:radial-gradient(120% 90% at 50% 35%,#fbfaf7 0%,#efede6 60%,#e4e1d8 100%)}
.shot img{display:block;width:88%;max-height:56mm;object-fit:contain;filter:drop-shadow(0 3mm 3mm rgba(11,31,58,.22))}
.shot small{font-size:7.5px;color:#6b7280}
table{margin-top:7mm;width:100%;border-collapse:collapse;font-size:9.5px}
th{text-align:left;font-weight:600;font-size:7.5px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #0000001f;padding:2mm 0}
td{padding:2.4mm 0;border-bottom:1px solid #00000012;vertical-align:top}td b{font-weight:600}
.spec{margin-top:.8mm;font-size:8.5px;color:#6b7280}.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;padding-left:4mm}
s{color:#9ca3af;font-weight:400}
.sum{margin:4mm 0 0 auto;width:78mm;font-size:10px}.sum div{display:flex;justify-content:space-between;padding:1mm 0}
.sum .disc{color:#0b7a4b}.sum .tot{margin-top:1.5mm;padding-top:2.5mm;border-top:1.5px solid ${primary};font-size:14px;font-weight:700;color:${primary}}
.sum .vat{color:#6b7280;font-size:9px}
.promise{margin-top:8mm;display:flex;gap:7mm;font-size:9px;font-weight:600}.promise span:before{content:"✓";margin-right:1.6mm;color:${accent}}
.accept{margin-top:6mm;padding:4mm 5mm;border-radius:12px;background:${primary};color:${onPrimary};font-size:10px}.accept b{font-size:11px}
.foot{margin-top:auto;padding-top:6mm;display:flex;justify-content:space-between;gap:8mm;font-size:7.5px;line-height:1.55;color:#9ca3af}
.foot .terms{max-width:85mm;white-space:pre-line}.foot .seller{text-align:right}
</style></head><body><div class="page">
<div class="top">${brand}<div class="ref">Offert<b>${esc(quote.quoteNo)}</b></div></div>
<p class="eyebrow">Offert</p>
<h1>Namnskyltar till ${esc(customer.company ?? customer.name)}</h1>
${quote.message ? `<p class="message">${esc(quote.message)}</p>` : ""}
<div class="grid"><div class="info">${info.map(([k, v]) => `<div><p class="k">${esc(k)}</p><p class="v">${esc(v)}</p></div>`).join("")}</div>
${
    quote.badgeShot
      ? `<div class="shot"><img src="${esc(quote.badgeShot)}" alt="">${quote.badges.length > 1 ? `<small>Visas med första namnet — alla ${quote.badges.length} namn står nedan</small>` : ""}</div>`
      : `<div class="stage">${svgs.join("")}</div>`
  }</div>
<table><thead><tr><th>Skylt</th><th class="r">Antal</th><th class="r">À-pris</th><th class="r">Summa</th></tr></thead><tbody>${rows}</tbody></table>
<div class="sum">
<div><span>Delsumma</span><span>${esc(sek(priced.subtotalSek))}</span></div>
${priced.discountSek > 0 ? `<div class="disc"><span>Rabatt ${priced.discountPercent} %</span><span>−${esc(sek(priced.discountSek))}</span></div>` : ""}
<div class="tot"><span>Totalt exkl. moms</span><span>${esc(sek(priced.totalSek))}</span></div>
<div class="vat"><span>Moms 25 %</span><span>${esc(sek(priced.vatSek))}</span></div>
<div class="vat"><span>Att betala inkl. moms</span><span>${esc(sek(priced.totalInclVatSek))}</span></div>
</div>
<div class="promise">${PROMISES.map((p) => `<span>${esc(p)}</span>`).join("")}</div>
<div class="accept"><b>Godkänn offerten</b> — öppna länken i mejlet och klicka ”Godkänn”, så går skyltarna till gravyren.</div>
<div class="foot"><div class="terms">Offerten gäller till ${esc(day(quote.validUntil))}.${company.quoteTerms ? `\n${esc(company.quoteTerms)}` : ""}</div><div class="seller">${footer.map(esc).join("<br>")}</div></div>
</div></body></html>`;
}
