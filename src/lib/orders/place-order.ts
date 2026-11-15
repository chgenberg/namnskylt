import "server-only";
import type { BadgeDocument } from "@/engine";
import type { PriceModel } from "@/engine/price-model";
import { MISSING_LOGO_IMAGE_ERROR, missingLogoImages } from "@/lib/logo-images/repository";
import { badgeCountLabel, customerLabel } from "@/lib/notices/model";
import { notify } from "@/lib/notices/notify";
import type { OrderPayment } from "@/lib/payments/model";
import { estimatedShipDate } from "@/lib/supplier/client";
import { dispatchOrder } from "@/lib/supplier/dispatch";
import { sendOrderConfirmation } from "./confirmation";
import type { Delivery } from "./delivery";
import { NOT_OFFERED_ERROR, allOffered, type OrderSource } from "./model";
import type { Pricing } from "./pricing";
import { partnerRequestNumber, splitByProducer } from "./partner";
import { createOrder, databaseConfigured } from "./repository";

export interface PlaceOrderInput {
  customer: { name: string; email: string; company?: string | null; orgNumber?: string | null };
  badges: BadgeDocument[];
  source: OrderSource;
  repeatOf?: string | null;
  note?: string | null;
  /** Demoorder: sparas men skickas inte till tillverkningen. */
  demo?: boolean;
  /** Återförsäljarens priser till kunden — påverkar inte vad tillverkningen får. */
  pricing?: Pricing | null;
  /** Prismodellen ordern sparas med; utelämnad = dagens. */
  priceModel?: PriceModel;
  /** Normaliserad stillbild av 3D-skylten (`normalizeBadgeShot`). */
  badgeShot?: string | null;
  /** Demobutiken ordern kom från. */
  shopSlug?: string | null;
  project?: string | null;
  /** Vart skyltarna skickas. Utan leverans sparas ordern, men den skickas inte till verkstaden förrän adressen är ifylld. */
  delivery?: Delivery | null;
  /** Betalningen, när kunden redan har betalat med kort. Utelämnad = ordern faktureras. */
  payment?: OrderPayment | null;
  /** Återförsäljaren ordern tillhör; webbshoppen och butikerna är ägarens. */
  tenant: string;
}

export interface PlaceOrderResult {
  /** Vårt ordernummer. */
  orderNumber: string;
  /**
   * `received` = verkstaden har ordern. `pending` = ordern är sparad och
   * skickas till verkstaden så snart det går: ett försök misslyckades eller en
   * uppgift saknas. `mock` = kopplingen till verkstaden är inte aktiverad, så
   * ingenting skickas. `request` = bara en förfrågan till partnern.
   */
  status: "received" | "pending" | "mock" | "request";
  estimatedShipDate?: string;
  partnerRequest?: string;
  supplierOrderNumber?: string;
  /** Koden i länken till kundens ordersida. Saknas när ordern inte sparades. */
  customerToken?: string;
}

/**
 * Sparar ordern och skickar verkstadens skyltar till Skylt & Gravyrteknik när
 * kopplingen är aktiverad. Ordern sparas alltid först: misslyckas utskicket
 * ligger den kvar med felet och skickas igen från adminens översikt, så att
 * kunden aldrig får ett fel för något som går att göra om. Partnerns skyltar
 * blir en förfrågan. Används av webbshoppen, butikerna, offerter och panelen.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  // Sista spärren: anroparna kontrollerar själva och svarar med ett begripligt fel.
  if (!allOffered(input.badges)) throw new Error(NOT_OFFERED_ERROR);
  // En skylt som pekar på en logga som inte finns på servern går inte att trycka.
  if (await missingLogoImages(input.badges)) throw new Error(MISSING_LOGO_IMAGE_ERROR);
  const { workshop, partner } = splitByProducer(input.badges);
  const partnerRequest = partner.length > 0 && !input.demo ? partnerRequestNumber() : undefined;

  if (!databaseConfigured()) {
    // Utan databas finns ingenstans att spara ordern: skyltmotorn går att prova, men inget beställs.
    if (partnerRequest) console.warn("Partnerförfrågan att hantera manuellt", partnerRequest);
    return workshop.length > 0
      ? { orderNumber: `MOCK-${Date.now().toString(36).toUpperCase()}`, status: "mock", estimatedShipDate: estimatedShipDate(), partnerRequest }
      : { orderNumber: partnerRequest ?? "", status: "request", partnerRequest };
  }

  const saved = await createOrder({
    customer: input.customer,
    badges: input.badges,
    status: "received",
    source: input.source,
    repeatOf: input.repeatOf,
    supplierOrderNo: input.demo ? "DEMO" : null,
    partnerRequestNo: partnerRequest ?? null,
    note:
      input.note ??
      (input.demo
        ? "Demoorder — skickas inte till tillverkningen"
        : partnerRequest
          ? `Partnerförfrågan ${partnerRequest}`
          : input.payment
            ? "Betald med kort"
            : null),
    demo: input.demo,
    pricing: input.pricing,
    priceModel: input.priceModel,
    badgeShot: input.badgeShot,
    shopSlug: input.shopSlug,
    project: input.project,
    delivery: input.delivery,
    payment: input.payment,
    tenant: input.tenant,
  });

  // En order kunden själv har lagt, i webbshoppen eller i en butik, kommer utan att panelens ägare har gjort något.
  if (!input.demo && (input.source === "web" || input.source === "shop")) {
    await notify({
      tenant: input.tenant,
      kind: "order-placed",
      who: customerLabel(input.customer),
      detail: badgeCountLabel(input.badges.reduce((sum, badge) => sum + badge.quantity, 0)),
      orderId: saved.id,
    });
    // Kunden får sin bekräftelse som mejl när sajtens mejl är påslagna. Mejlet väntar kunden inte på.
    void sendOrderConfirmation(saved.orderNo);
  }

  const customerToken = saved.customerToken;
  if (input.demo) return { orderNumber: saved.orderNo, status: "mock", customerToken };
  if (workshop.length === 0) return { orderNumber: saved.orderNo, status: "request", partnerRequest, customerToken };

  const sent = await dispatchOrder(saved.orderNo);
  return sent.ok
    ? {
        orderNumber: saved.orderNo,
        status: "received",
        estimatedShipDate: sent.estimatedShipDate ?? estimatedShipDate(),
        partnerRequest,
        supplierOrderNumber: sent.supplierOrderNo,
        customerToken,
      }
    : {
        orderNumber: saved.orderNo,
        // Kunden har lagt sin order i båda fallen. Bara utan koppling är det ett testläge.
        status: sent.reason === "not-configured" ? "mock" : "pending",
        estimatedShipDate: estimatedShipDate(),
        partnerRequest,
        customerToken,
      };
}
