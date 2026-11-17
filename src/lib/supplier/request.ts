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
import { orgNumberDigits } from "@/lib/company/org-number";
import type { CompanyProfile } from "@/lib/company/profile";
import { guessAddress, shippingMethodOf, type Delivery, type DeliveryAddress } from "@/lib/orders/delivery";
import { isErasedCustomer } from "@/lib/orders/erase-model";
import { splitByProducer } from "@/lib/orders/partner";
import { OWNER_TENANT } from "@/lib/tenants/model";
import { toSupplierSignDocument } from "./map";
import type {
  SupplierAddress,
  SupplierBillingAddress,
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
  // Verkstaden läser tio siffror, även ur ett momsnummer eller ett nummer med sekel. Allt annat
  // nekar den för gott, så ett sådant nummer ska rättas här i stället för att skickas.
  else if (!orgNumberDigits(buyer.orgNumber)) problems.push("Återförsäljarens organisationsnummer ska ha tio siffror");
  if (!buyer?.email) problems.push("Återförsäljarens e-postadress saknas");
  if (splitByProducer(order.badges).workshop.length === 0) problems.push("Ordern har inga skyltar som verkstaden tillverkar");
  return problems;
}

/** Verkstadens gränser för adressens fält. En längre adress skickas hellre inte alls än stoppar ordern. */
const BILLING_LINE_MAX = 200;
const BILLING_CITY_MAX = 120;

/**
 * Fakturaadressen ur företagets fria adresstext, när den går att läsa som gata,
 * postnummer och ort. Står företagets namn först i texten hoppas det över, så
 * att gatan hamnar som gata, vare sig adressen är skriven på flera rader eller
 * med komma emellan (delarna är desamma som `guessAddress` läser). `null` när
 * adressen inte går att läsa säkert: då följer bara den fria texten med.
 */
function billingAddress(text: string, companyName: string): SupplierBillingAddress | null {
  const parts = text
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const withoutName = parts[0]?.toLowerCase() === companyName.trim().toLowerCase() ? parts.slice(1).join("\n") : text;
  const { line1, line2, zip, city } = guessAddress(withoutName);
  if (!line1 || !zip || !city) return null;
  if (line1.length > BILLING_LINE_MAX || line2.length > BILLING_LINE_MAX || city.length > BILLING_CITY_MAX) return null;
  return { line1, ...(line2 && { line2 }), zip, city, country: "SE" };
}

/** Beställaren hos verkstaden ur återförsäljarens uppgifter. E-posten är företagets adress för fakturor, annars företagets, annars kontots. */
export function supplierBuyer(tenant: string, company: CompanyProfile, accountEmail: string | null): SupplierBuyer {
  const billing = billingAddress(company.address, company.name);
  const email = company.invoiceEmail || company.email || accountEmail || "";
  const contactEmail = company.email || accountEmail || "";
  return {
    id: tenant,
    name: company.name,
    orgNumber: company.orgNumber,
    email,
    ...(contactEmail && contactEmail !== email && { contactEmail }),
    ...(company.phone && { phone: company.phone }),
    ...(company.address && { address: company.address }),
    ...(billing && { billingAddress: billing }),
  };
}

/**
 * Adressen transportören aviserar leveransen på. namnskylt.coms egna kunder
 * aviseras direkt. I övrigt aviseras återförsäljaren, på sin vanliga adress
 * och inte fakturabrevlådan: både när skyltarna går dit och när de går till
 * återförsäljarens kund (beslut av ägaren 2026-11-17: verkstaden står som
 * avsändare i aviseringen och ska inte synas för butikens kund). Vid
 * upphämtning aviseras ingen. En borttagen kund har ingen adress att avisera på.
 */
function notificationEmail(input: Pick<SupplierRequestInput, "buyer" | "customer" | "delivery">): string {
  if (shippingMethodOf(input.delivery) === "pickup") return "";
  const reseller = (input.buyer.contactEmail || input.buyer.email).trim();
  const ownCustomer = input.delivery.to === "customer" && input.buyer.id === OWNER_TENANT && !isErasedCustomer(input.customer);
  return (ownCustomer && input.customer.email.trim()) || reseller;
}

/** `email` är adressen transportören aviserar på, se `notificationEmail`. */
function supplierAddress(address: DeliveryAddress, email: string): SupplierAddress {
  return {
    name: address.name,
    ...(address.contactName && { contactName: address.contactName }),
    line1: address.line1,
    ...(address.line2 && { line2: address.line2 }),
    zip: address.zip,
    city: address.city,
    country: address.country,
    ...(address.phone && { phone: address.phone }),
    ...(email && { email }),
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
    // Miniatyren behövs när loggan graveras (den visar gravyrformen). En logga som printas är
    // sin egen bild när den är i färg och ligger annars i trycklagret, utom när typsnittet saknar
    // konturer: då finns inget trycklager, och den svartvita loggan skickas som miniatyr.
    const { logo } = badge;
    const logoEngraved = logoMarking(badge) === "engrave";
    const thumbnailOf = logo && (logoEngraved || (!logo.image && !input.fonts.outline)) ? logo : null;
    const document = toSupplierSignDocument(badge, input.fonts, {
      logoPng: thumbnailOf
        ? input.logoPng?.(logoEngraved ? { ...thumbnailOf, d: logoEngravingPath(thumbnailOf) } : thumbnailOf)
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
      address: supplierAddress(input.delivery.address, notificationEmail(input)),
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
