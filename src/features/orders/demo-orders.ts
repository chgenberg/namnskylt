import { createBadgeDocument, withTexts, type BadgeDocument } from "@/engine";
import type { ProductionOrder } from "@/lib/production";

/**
 * Påhittade ordrar till mockupen. Inga riktiga kunder — ordrar sparas ännu
 * inte i någon databas, de går direkt till leverantören.
 */

export type OrderStatus = "new" | "in-production" | "shipped";

export interface AdminOrder extends ProductionOrder {
  status: OrderStatus;
  email: string;
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  new: "Ny",
  "in-production": "I produktion",
  shipped: "Skickad",
};

/** Enkel tvåfärgsmarkering (ram med fyrkant) som demologga — bara M/L/Z. */
const DEMO_LOGO = {
  d: "M0 0L100 0L100 100L0 100Z M18 18L18 82L82 82L82 18Z M34 34L66 34L66 66L34 66Z",
  viewWidth: 100,
  viewHeight: 100,
  placement: "left" as const,
  heightMm: 16,
};

function team(template: BadgeDocument, people: readonly (readonly string[])[]): BadgeDocument[] {
  return people.map((texts) => withTexts(template, texts));
}

/** Demoordrarna är gravyrplast om inget annat sägs — färgerna nedan är plastens. */
const base: BadgeDocument = { ...createBadgeDocument(), materialId: "plastic-2-layer", colorId: "white-black" };

export const DEMO_ORDERS: readonly AdminOrder[] = [
  {
    orderNo: "NS-1042",
    customer: "Maria Ek",
    company: "ICA Kvantum Lindhagen",
    email: "maria.ek@example.se",
    placedAt: "2026-10-27T07:12:00+01:00",
    status: "new",
    badges: team({ ...base, colorId: "red-white" }, [
      ["Maria Ek", "Butikschef"],
      ["Ahmed Yusuf", "Kassa"],
      ["Linnea Berg", "Färskvaror"],
      ["Johan Ström", "Lager"],
      ["Sara Holm", "Kundtjänst"],
      ["Erik Lund", "Delikatess"],
    ]),
  },
  {
    orderNo: "NS-1043",
    customer: "Gunilla Berg",
    company: "Folktandvården Odenplan",
    email: "gunilla.berg@example.se",
    placedAt: "2026-10-27T08:03:00+01:00",
    status: "new",
    badges: team(
      { ...base, colorId: "darkblue-white", size: { widthMm: 76, heightMm: 32 }, mounting: "magnet", logo: DEMO_LOGO },
      [
        ["Gunilla Berg", "Tandhygienist"],
        ["Karim Haddad", "Tandläkare"],
        ["Ellen Sjöberg", "Tandsköterska"],
        ["Olof Nyström", "Klinikchef"],
      ],
    ),
  },
  {
    orderNo: "NS-1044",
    customer: "Anders Wik",
    company: "Hotell Kronan",
    email: "anders@example.se",
    placedAt: "2026-10-26T16:40:00+01:00",
    status: "in-production",
    badges: team(
      {
        ...base,
        colorId: "gold-black",
        shape: "rectangle",
        cornerRadiusMm: 0,
        size: { widthMm: 90, heightMm: 30 },
        mounting: "clip",
        frame: { style: "solid", insetMm: 1.5, thicknessMm: 0.4 },
      },
      [
        ["Anders Wik", "Hotellchef"],
        ["Fatima Rahimi", "Reception"],
        ["Tove Ahl", "Concierge"],
      ],
    ),
  },
  {
    orderNo: "NS-1045",
    customer: "Klara Persson",
    email: "klara@example.se",
    placedAt: "2026-10-26T13:21:00+01:00",
    status: "new",
    badges: [{ ...withTexts(base, ["Personal"]), mounting: "safety-pin", quantity: 12 }],
  },
  {
    orderNo: "NS-1046",
    customer: "Peter Sund",
    company: "Mekonomen Solna",
    email: "peter.sund@example.se",
    placedAt: "2026-10-26T10:05:00+01:00",
    status: "new",
    badges: team(
      { ...base, materialId: "stainless", colorId: "steel-laser", shape: "rectangle", cornerRadiusMm: 0, mounting: "magnet" },
      [
        ["Peter Sund", "Verkstadschef"],
        ["Mikael Öberg", "Mekaniker"],
        ["Nora Ali", "Servicetekniker"],
        ["Viktor Hed", "Mekaniker"],
      ],
    ),
  },
  {
    orderNo: "NS-1047",
    customer: "Helena Kraft",
    company: "Länsförsäkringar Uppsala",
    email: "helena.kraft@example.se",
    placedAt: "2026-10-25T15:48:00+01:00",
    status: "in-production",
    badges: team(
      { ...base, materialId: "aluminium-anodized", colorId: "alu-natural-black", size: { widthMm: 76, heightMm: 32 } },
      [
        ["Helena Kraft", "Rådgivare"],
        ["David Lindgren", "Försäkringsspecialist"],
        ["Amira Saleh", "Kontorschef"],
      ],
    ),
  },
  {
    orderNo: "NS-1048",
    customer: "Jonas Falk",
    company: "Café Mandel",
    email: "jonas@example.se",
    placedAt: "2026-10-25T09:30:00+01:00",
    status: "shipped",
    badges: team({ ...base, shape: "oval", size: { widthMm: 70, heightMm: 35 } }, [
      ["Jonas", "Barista"],
      ["Elsa", "Barista"],
      ["Moa", "Bagare"],
    ]),
  },
  {
    orderNo: "NS-1049",
    customer: "Ida Norén",
    company: "Norén Arkitekter",
    email: "ida@example.se",
    placedAt: "2026-10-24T11:12:00+01:00",
    status: "new",
    badges: team(
      { ...base, size: { widthMm: 60, heightMm: 20 }, mounting: "magnet", font: "arial-narrow" },
      [
        ["Ida Norén", "Arkitekt SAR/MSA"],
        ["Leo Brandt", "Arkitekt"],
        ["Maja Kim", "Inredningsarkitekt"],
        ["Sven Dahl", "Landskapsarkitekt"],
        ["Alva Moberg", "Projektledare"],
      ],
    ),
  },
];
