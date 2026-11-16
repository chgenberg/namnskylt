import { createHash } from "node:crypto";
import {
  layoutBadge,
  logoEngravingPath,
  logoMarking,
  renderBadgeSvg,
  resellerOrder,
  shippingKind,
  withShippingMethod,
  type BadgeDocument,
  type BadgeLogo,
  type FontEngine,
  type PriceTable,
} from "@/engine";
import type { CompanyProfile } from "@/lib/company/profile";
import { shippingMethodOf, type Delivery, type DeliveryAddress } from "@/lib/orders/delivery";
import { splitByProducer } from "@/lib/orders/partner";
import { toSupplierSignDocument } from "./map";
import type {
  SupplierAddress,
  SupplierBuyer,
  SupplierOrderRequest,
  SupplierShippingMethod,
  SupplierSignDocument,
} from "./types";

/** Lambda hos leverantören tar högst 6 MB per anrop. Marginalen är till för huvuden och kodning. */
export const MAX_REQUEST_BYTES = 5_500_000;

const IMAGE_REF_PREFIX = "image:";

const SHIPPING_METHOD = { letter: "postnord-varubrev", parcel: "dhl-paket" } as const satisfies Record<string, SupplierShippingMethod>;

/** Verkstadens kod för orderns fraktsätt. Standardfrakten blir varubrev eller paket efter varuvärdet. */
function supplierShippingMethod(delivery: Delivery, goodsSek: number, purchaseList: PriceTable): SupplierShippingMethod {
  const method = shippingMethodOf(delivery);
  if (method === "express") return "postnord-express";
  if (method === "pickup") return "pickup-hogsbo";
  return SHIPPING_METHOD[shippingKind(goodsSek, purchaseList) ?? "letter"];
}

/** Det som saknas för att en order ska gå att skicka till verkstaden. Tom lista = klar att skicka. */
export function dispatchProblems(order: { badges: readonly BadgeDocument[]; delivery: Delivery | null }, buyer: SupplierBuyer | null): string[] {
  const problems: string[] = [];
  if (!order.delivery) problems.push("Leveransadress saknas");
  if (!buyer?.orgNumber) problems.push("Återförsäljarens organisationsnummer saknas");
  if (!buyer?.email) problems.push("Återförsäljarens e-postadress saknas");
  if (splitByProducer(order.badges).workshop.length === 0) problems.push("Ordern har inga skyltar som verkstaden tillverkar");
  return problems;
}

/** Beställaren hos verkstaden ur återförsäljarens uppgifter. E-posten är företagets adress för fakturor, annars företagets, annars kontots. */
export function supplierBuyer(tenant: string, company: CompanyProfile, accountEmail: string | null): SupplierBuyer {
  return {
    id: tenant,
    name: company.name,
    orgNumber: company.orgNumber,
    email: company.invoiceEmail || company.email || accountEmail || "",
    ...(company.phone && { phone: company.phone }),
    ...(company.address && { address: company.address }),
  };
}

function supplierAddress(address: DeliveryAddress): SupplierAddress {
  return {
    name: address.name,
    ...(address.contactName && { contactName: address.contactName }),
    line1: address.line1,
    ...(address.line2 && { line2: address.line2 }),
    zip: address.zip,
    city: address.city,
    country: address.country,
    ...(address.phone && { phone: address.phone }),
  };
}

/** Flyttar dokumentets bilder till den gemensamma bildlistan och låter lagren peka dit. */
function withImageRefs(document: SupplierSignDocument, images: Record<string, string>): SupplierSignDocument {
  return {
    ...document,
    layers: document.layers.map((layer) => {
      if (layer.data.kind !== "image" || !layer.data.src) return layer;
      const key = createHash("sha256").update(layer.data.src).digest("hex").slice(0, 16);
      images[key] = layer.data.src;
      return { ...layer, data: { ...layer.data, src: `${IMAGE_REF_PREFIX}${key}` } };
    }),
  };
}

export interface SupplierRequestInput {
  orderNo: string;
  project: string | null;
  customer: { name: string; email: string; company: string | null };
  buyer: SupplierBuyer;
  delivery: Delivery;
  /** Orderns alla skyltar, med loggornas bilder inlagda (`withInlineLogoImages`). */
  badges: readonly BadgeDocument[];
  /** Återförsäljarens prislista från när ordern lades. */
  purchaseList: PriceTable;
  fonts: FontEngine;
  /** Svartvit miniatyr av en graverad logga. */
  logoPng?: (logo: BadgeLogo) => string;
}

/**
 * Ordern som verkstaden ska ha den: dokument och produktionsfil per skylt, det
 * återförsäljaren betalar per rad, frakten och leveransadressen. Priserna
 * räknas på hela ordern, så att trappsteget och startkostnaden blir samma som
 * i panelen.
 */
export function buildSupplierRequest(input: SupplierRequestInput): SupplierOrderRequest {
  // Frakten följer orderns fraktsätt: upphämtning och express har ingen fraktkostnad i anropet.
  const price = resellerOrder(input.badges, withShippingMethod(input.purchaseList, shippingMethodOf(input.delivery)));
  const { workshop } = splitByProducer(input.badges);
  const images: Record<string, string> = {};
  const lines = input.badges.flatMap((badge, i) => {
    if (!workshop.includes(badge)) return [];
    const document = toSupplierSignDocument(badge, input.fonts, {
      // En logga i färg som printas skickas som sin egen bild; alla andra behöver en svartvit miniatyr.
      // Miniatyren visar det som märks: gravyrformen när loggan graveras, annars loggans banor.
      logoPng:
        badge.logo && !(badge.logo.image && logoMarking(badge) === "print")
          ? input.logoPng?.(logoMarking(badge) === "engrave" ? { ...badge.logo, d: logoEngravingPath(badge.logo) } : badge.logo)
          : undefined,
    });
    return [
      {
        document: withImageRefs(document, images),
        productionSvg: renderBadgeSvg(badge, layoutBadge(badge, input.fonts), { mode: "production", fonts: input.fonts }),
        quantity: Math.max(1, Math.floor(badge.quantity)),
        reference: `${input.orderNo}-${i + 1}`,
        unitPriceSek: price.unitSek[i] ?? 0,
      },
    ];
  });
  return {
    orderRef: input.orderNo,
    ...(input.project && { orderName: input.project }),
    buyer: input.buyer,
    customer: {
      name: input.customer.name,
      email: input.customer.email,
      ...(input.customer.company && { company: input.customer.company }),
    },
    shipping: {
      method: supplierShippingMethod(input.delivery, price.goodsSek, input.purchaseList),
      costSek: price.shippingSek,
      address: supplierAddress(input.delivery.address),
    },
    lines,
    minimumTopUpSek: price.minimumTopUpSek,
    goodsSek: price.goodsSek,
    images,
  };
}

/** Anropets storlek i byte, som det skickas. */
export function requestBytes(request: SupplierOrderRequest): number {
  return Buffer.byteLength(JSON.stringify(request), "utf8");
}
