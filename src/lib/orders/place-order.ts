import "server-only";
import { layoutBadge, renderBadgeSvg, type BadgeDocument } from "@/engine";
import { renderLogoPng } from "@/lib/ai/badge-image";
import { loadNodeFontEngine } from "@/lib/fonts/load-node";
import { createSupplierClient } from "@/lib/supplier/client";
import { toSupplierSignDocument } from "@/lib/supplier/map";
import type { OrderSource } from "./model";
import type { Pricing } from "./pricing";
import { partnerRequestNumber, splitByProducer } from "./partner";
import { createOrder, databaseConfigured } from "./repository";

export interface PlaceOrderInput {
  customer: { name: string; email: string; company?: string | null };
  badges: BadgeDocument[];
  source: OrderSource;
  repeatOf?: string | null;
  note?: string | null;
  /** Demoorder: sparas men skickas inte till tillverkningen. */
  demo?: boolean;
  /** Återförsäljarens priser till kunden — påverkar inte vad tillverkningen får. */
  pricing?: Pricing | null;
  /** Normaliserad stillbild av 3D-skylten (`normalizeBadgeShot`). */
  badgeShot?: string | null;
  /** Demobutiken ordern kom från. */
  shopSlug?: string | null;
  /** Återförsäljaren ordern tillhör; webbshoppen och butikerna är ägarens. */
  tenant: string;
}

export interface PlaceOrderResult {
  /** Vårt ordernummer när ordern sparats, annars leverantörens. */
  orderNumber: string;
  status: "received" | "mock" | "request";
  estimatedShipDate?: string;
  partnerRequest?: string;
  supplierOrderNumber?: string;
}

/**
 * Skickar verkstadens skyltar till Skylt & Gravyrteknik, gör en förfrågan av
 * partnerns, och sparar ordern när databasen finns. Används av webbshoppen och
 * av återförsäljarens "Beställ igen".
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  if (input.demo) return placeDemoOrder(input);
  const { workshop, partner } = splitByProducer(input.badges);
  const partnerRequest = partner.length > 0 ? partnerRequestNumber() : undefined;

  let supplier: { orderNumber: string; status: "received" | "mock"; estimatedShipDate: string } | undefined;
  if (workshop.length > 0) {
    const fonts = await loadNodeFontEngine();
    supplier = await createSupplierClient().placeOrder({
      customer: { name: input.customer.name, email: input.customer.email, company: input.customer.company ?? undefined },
      lines: workshop.map((badge, i) => ({
        document: toSupplierSignDocument(badge, fonts, { logoPng: badge.logo ? renderLogoPng(badge.logo) : undefined }),
        productionSvg: renderBadgeSvg(badge, layoutBadge(badge, fonts), { mode: "production", fonts }),
        quantity: badge.quantity,
        reference: `NS-${i + 1}`,
      })),
    });
  }

  let savedOrderNo: string | undefined;
  if (databaseConfigured()) {
    try {
      const saved = await createOrder({
        customer: input.customer,
        badges: input.badges,
        status: "received",
        source: input.source,
        repeatOf: input.repeatOf,
        supplierOrderNo: supplier?.orderNumber ?? null,
        partnerRequestNo: partnerRequest ?? null,
        note: input.note ?? (partnerRequest ? `Partnerförfrågan ${partnerRequest}` : null),
        pricing: input.pricing,
        badgeShot: input.badgeShot,
        shopSlug: input.shopSlug,
        tenant: input.tenant,
      });
      savedOrderNo = saved.orderNo;
    } catch (error) {
      // Leverantören har redan ordern — kunden ska inte få ett fel för att vår kopia misslyckades.
      console.error("Ordern skickades men kunde inte sparas", error);
    }
  } else if (partnerRequest) {
    console.warn("Partnerförfrågan att hantera manuellt", partnerRequest, {
      customer: input.customer,
      badges: partner.map((b) => ({ materialId: b.materialId, colorId: b.colorId, shape: b.shape, size: b.size, quantity: b.quantity })),
    });
  }

  if (!supplier) {
    return { orderNumber: savedOrderNo ?? partnerRequest ?? "", status: "request", partnerRequest };
  }
  return {
    orderNumber: savedOrderNo ?? supplier.orderNumber,
    status: supplier.status,
    estimatedShipDate: supplier.estimatedShipDate,
    partnerRequest,
    supplierOrderNumber: supplier.orderNumber,
  };
}

async function placeDemoOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const saved = await createOrder({
    customer: input.customer,
    badges: input.badges,
    status: "received",
    source: input.source,
    repeatOf: input.repeatOf,
    supplierOrderNo: "DEMO",
    note: input.note ?? "Demoorder — skickas inte till tillverkningen",
    demo: true,
    pricing: input.pricing,
    badgeShot: input.badgeShot,
    tenant: input.tenant,
  });
  return { orderNumber: saved.orderNo, status: "mock" };
}
