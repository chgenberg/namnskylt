import "server-only";
import type { BadgeDocument } from "@/engine";
import type { PriceModel } from "@/engine/price-model";
import { MISSING_LOGO_IMAGE_ERROR, missingLogoImages } from "@/lib/logo-images/repository";
import { badgeCountLabel, customerLabel } from "@/lib/notices/model";
import { notify } from "@/lib/notices/notify";
import type { OrderPayment } from "@/lib/payments/model";
import { estimatedShipDate } from "@/lib/supplier/client";
import { OWNER_TENANT, isOwner } from "@/lib/tenants/model";
import { dispatchOrder } from "@/lib/supplier/dispatch";
import { sendOrderConfirmation } from "./confirmation";
import type { Delivery } from "./delivery";
import { NOT_OFFERED_ERROR, allOffered, isPlacedByCustomer, type OrderSource } from "./model";
import type { Pricing } from "./pricing";
import { partnerRequestNumber, splitByProducer } from "./partner";
import { createOrder, databaseConfigured, getCompanyProfile } from "./repository";

export interface PlaceOrderInput {
  customer: { name: string; email: string; company?: string | null; orgNumber?: string | null };
  /** Kunden som redan finns, till exempel offertens kund: ordern hör då till den, också utan e-post. */
  customerId?: string | null;
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
  /** Beställarens eget inköpsnummer, som ska stå på fakturan. */
  customerPo?: string | null;
  /** Vart skyltarna skickas. Utan leverans sparas ordern, men den skickas inte till verkstaden förrän adressen är ifylld. */
  delivery?: Delivery | null;
  /** Betalningen, när kunden redan har betalat med kort. Utelämnad = ordern faktureras. */
  payment?: OrderPayment | null;
  /** Kundkontot som var inloggat när ordern lades. */
  accountId?: string | null;
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
 * Beskedet till namnskylt.com om en ny order (beslut av ägaren 2026-11-20: adminen ska få mejl om
 * varje order). En order hos en återförsäljare nämner återförsäljaren, inte dess kund. En order i
 * namnskylt.coms egen panel nämner kunden. En order som kunden själv lade hos namnskylt.com har
 * redan gett sitt besked, och ger inget till.
 */
async function notifyOwner(input: PlaceOrderInput, orderId: string, placedByCustomer: boolean): Promise<void> {
  const detail = badgeCountLabel(input.badges.reduce((sum, badge) => sum + badge.quantity, 0));
  if (isOwner(input.tenant)) {
    if (!placedByCustomer) await notify({ tenant: OWNER_TENANT, kind: "order-created", who: customerLabel(input.customer), detail, orderId });
    return;
  }
  // Beskedet får aldrig stoppa ordern, inte heller om säljarens namn inte går att läsa.
  const seller = await getCompanyProfile(input.tenant).then((company) => company.name, () => input.tenant);
  await notify({ tenant: OWNER_TENANT, kind: "reseller-order", who: seller, detail, orderId });
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
    customerId: input.customerId ?? null,
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
    customerPo: input.customerPo,
    delivery: input.delivery,
    payment: input.payment,
    accountId: input.accountId,
    tenant: input.tenant,
  });

  // En order kunden själv har lagt, i webbshoppen eller i en butik, kommer utan att panelens ägare har gjort något.
  const placedByCustomer = isPlacedByCustomer(input.source);
  if (!input.demo && placedByCustomer) {
    await notify({
      tenant: input.tenant,
      kind: "order-placed",
      who: customerLabel(input.customer),
      detail: badgeCountLabel(input.badges.reduce((sum, badge) => sum + badge.quantity, 0)),
      orderId: saved.id,
    });
    // En kund i en återförsäljares butik får sin bekräftelse som mejl härifrån (`customerGetsSiteMail`).
    // Mejlet väntar kunden inte på.
    void sendOrderConfirmation(saved.orderNo);
  }
  // namnskylt.com får besked om varje ny order på plattformen (beslut av ägaren 2026-11-20).
  if (!input.demo) await notifyOwner(input, saved.id, placedByCustomer);

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
