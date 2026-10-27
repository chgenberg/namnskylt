import { engravedRows, getColor, getMaterial, getMounting } from "@/engine";
import { badgeCount, ORDER_STATUS_LABEL, type StoredOrder } from "./model";
import { priceWithPricing } from "./pricing";

/** Semikolon och komma som decimaltecken — så öppnar svenska Excel filen rätt. */
const SEPARATOR = ";";
/** BOM gör att Excel läser filen som UTF-8 och visar å, ä, ö. */
const BOM = "\uFEFF";

function cell(value: string | number | null): string {
  const text = value === null ? "" : typeof value === "number" ? String(value).replace(".", ",") : value;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(header: readonly string[], rows: readonly (readonly (string | number | null)[])[]): string {
  return BOM + [header, ...rows].map((row) => row.map(cell).join(SEPARATOR)).join("\r\n") + "\r\n";
}

function date(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date(iso));
}

export function ordersCsv(orders: readonly StoredOrder[]): string {
  return toCsv(
    ["Order", "Datum", "Kund", "Företag", "E-post", "Status", "Skyltar", "Belopp exkl. moms", "Belopp inkl. moms", "Spårning"],
    orders.map((o) => [
      o.orderNo,
      date(o.placedAt),
      o.customer.name,
      o.customer.company,
      o.customer.email,
      ORDER_STATUS_LABEL[o.status],
      badgeCount(o),
      o.totalSek,
      o.totalInclVatSek,
      o.trackingUrl,
    ]),
  );
}

/**
 * Fakturaunderlag: en rad per skylt med artikeltext och pris. Kolumnerna går
 * att mappa vid import i Fortnox eller Visma.
 */
export function invoiceCsv(orders: readonly StoredOrder[]): string {
  const rows = orders
    .filter((o) => o.status !== "cancelled")
    .flatMap((o) => {
      const priced = priceWithPricing(o.badges, o.pricing);
      const rows = o.badges.map((badge, i) => {
        const unit = priced.lines[i]?.unitSek ?? 0;
        const text = engravedRows(badge)
          .map((row) => row.text.trim())
          .filter(Boolean)
          .join(" / ");
        const article = `${getMaterial(badge.materialId).name} ${getColor(badge.materialId, badge.colorId).name}, ${badge.size.widthMm}×${badge.size.heightMm} mm, ${getMounting(badge.mounting).name}`;
        return [
          o.orderNo,
          date(o.placedAt),
          o.customer.company ?? o.customer.name,
          o.customer.email,
          `Namnskylt: ${text || "utan text"}`,
          article,
          badge.quantity,
          unit,
          unit * badge.quantity,
          25,
        ];
      });
      if (priced.discountSek === 0) return rows;
      return [
        ...rows,
        [o.orderNo, date(o.placedAt), o.customer.company ?? o.customer.name, o.customer.email, `Rabatt ${priced.discountPercent} %`, "", 1, -priced.discountSek, -priced.discountSek, 25],
      ];
    });
  return toCsv(
    ["Order", "Datum", "Kund", "E-post", "Benämning", "Artikel", "Antal", "À-pris exkl. moms", "Summa exkl. moms", "Moms %"],
    rows,
  );
}
