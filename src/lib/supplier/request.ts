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
  extraDeliverySekOf,
} from "@/engine";
import { orgNumberDigits } from "@/lib/company/org-number";
import type { CompanyProfile } from "@/lib/company/profile";
import { cleanCustomerPo } from "@/lib/orders/customer-po";
import { deliveryInstructionsOf, guessAddress, shippingMethodOf, type Delivery, type DeliveryAddress } from "@/lib/orders/delivery";
import { isErasedCustomer } from "@/lib/orders/erase-model";
import type { Customer } from "@/lib/orders/model";
import { splitByProducer } from "@/lib/orders/partner";
import { isLineInvoiceable, priceWithPricing, type Pricing } from "@/lib/orders/pricing";
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

/**
 * Verkstadens kod för orderns fraktsätt. Standardfrakten blir varubrev eller paket efter
 * fraktregeln, och den som har valt paket får paket.
 */
function supplierShippingMethod(delivery: Delivery, goodsSek: number, quantity: number, purchaseList: PriceTable): SupplierShippingMethod {
  const method = shippingMethodOf(delivery);
  if (method === "express") return "postnord-express";
  if (method === "pickup") return "pickup-hogsbo";
  if (method === "parcel") return SHIPPING_METHOD.parcel;
  return SHIPPING_METHOD[shippingKind(goodsSek, purchaseList, quantity) ?? "letter"];
}

/**
 * Det som saknas för att en order ska gå att skicka till verkstaden. Tom lista = klar att skicka.
 * `direct` är en direktorder, där kunden är den verkstaden fakturerar (se `DirectSale`).
 */
export function dispatchProblems(
  order: { badges: readonly BadgeDocument[]; delivery: Delivery | null; pricing?: Pricing | null },
  buyer: SupplierBuyer | null,
  direct = false,
): string[] {
  const who = direct ? "Kundens" : "Återförsäljarens";
  const problems: string[] = [];
  if (!order.delivery) problems.push("Leveransadress saknas");
  if (!buyer?.orgNumber) problems.push(`${who} organisationsnummer saknas`);
  // Verkstaden läser tio siffror, även ur ett momsnummer eller ett nummer med sekel. Allt annat
  // nekar den för gott, så ett sådant nummer ska rättas här i stället för att skickas.
  else if (!orgNumberDigits(buyer.orgNumber)) problems.push(`${who} organisationsnummer ska ha tio siffror`);
  if (!buyer?.email) problems.push(`${who} e-postadress saknas`);
  if (splitByProducer(order.badges).workshop.length === 0) problems.push("Ordern har inga skyltar som verkstaden tillverkar");
  if (direct) {
    // En borttagen kund har en platshållare till adress och ska varken faktureras eller mejlas.
    if (buyer?.email && isErasedCustomer({ email: buyer.email })) problems.push("Kunden är borttagen");
    // Verkstaden fakturerar kunden rad för rad. En rabatt i procent och egna extrarader har ingen
    // plats i anropet, och ett belopp som inte stämmer med kundens ska hellre vänta än faktureras.
    if (!isLineInvoiceable(order.pricing)) {
      problems.push("Ordern har rabatt i procent eller extrarader, som verkstaden inte kan fakturera. Lägg priset som à-pris per skylt");
    }
  }
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
 * Beställaren hos verkstaden på en direktorder: kunden själv, med företagets
 * organisationsnummer. Verkstaden bekräftar, fakturerar och mejlar då kunden
 * direkt. Fakturaadressen är kundens egen när den går att läsa, annars
 * leveransadressen när skyltarna ska till kunden.
 */
export function customerBuyer(customer: Pick<Customer, "name" | "company" | "orgNumber" | "email" | "phone" | "address">, delivery: Delivery | null): SupplierBuyer {
  const name = customer.company?.trim() || customer.name;
  const own = customer.address ? billingAddress(customer.address, name) : null;
  const to = delivery?.to === "customer" ? delivery.address : null;
  const billing: SupplierBillingAddress | null =
    own ?? (to ? { line1: to.line1, ...(to.line2 && { line2: to.line2 }), zip: to.zip, city: to.city, country: "SE" } : null);
  return {
    id: OWNER_TENANT,
    name,
    orgNumber: customer.orgNumber ?? "",
    email: customer.email,
    ...(customer.phone && { phone: customer.phone }),
    ...(customer.address && { address: customer.address }),
    ...(billing && { billingAddress: billing }),
  };
}

/**
 * En direktorder: kunden beställde av namnskylt.com, utan återförsäljare. Då
 * sköter Skylt & Gravyrteknik allt mot kunden (beslut av ägaren 2026-11-17):
 * kunden är beställaren (`customerBuyer`), raderna bär kundens pris, och
 * verkstaden bekräftar och fakturerar kunden. En återförsäljares order
 * faktureras alltid återförsäljaren, till inköpspris.
 */
interface DirectSale {
  /** Slutkundens prislista från när ordern lades. */
  priceList: PriceTable;
  /** Egna priser på ordern; `null` = listpris. Rabatt i procent och extrarader stoppas av `dispatchProblems`. */
  pricing: Pricing | null;
  /** namnskylt.coms egen adress, dit aviseringen går när skyltarna skickas till oss själva. */
  sellerEmail: string;
}

/**
 * Adressen transportören aviserar leveransen på. namnskylt.coms egna kunder
 * aviseras direkt. I övrigt aviseras återförsäljaren, på sin vanliga adress
 * och inte fakturabrevlådan: både när skyltarna går dit och när de går till
 * återförsäljarens kund (beslut av ägaren 2026-11-17: verkstaden står som
 * avsändare i aviseringen och ska inte synas för butikens kund). Vid
 * upphämtning aviseras ingen. En borttagen kund har ingen adress att avisera på.
 */
function notificationEmail(input: Pick<SupplierRequestInput, "buyer" | "customer" | "delivery" | "direct">): string {
  if (shippingMethodOf(input.delivery) === "pickup") return "";
  // Säljarens adress: återförsäljarens vanliga, eller namnskylt.coms egen på en direktorder.
  const seller = (input.direct ? input.direct.sellerEmail : input.buyer.contactEmail || input.buyer.email).trim();
  // Regeln följer säljaren, inte hur ordern faktureras: också en kortbetald order hos namnskylt.com aviserar kunden.
  const ownCustomer = input.delivery.to === "customer" && input.buyer.id === OWNER_TENANT && !isErasedCustomer(input.customer);
  return (ownCustomer && input.customer.email.trim()) || seller;
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

/** Så lång får orderns märkning vara hos verkstaden. */
const ORDER_NAME_MAX = 120;

/**
 * Orderns märkning hos verkstaden: projektets namn och beställarens eget inköpsnummer. Verkstadens
 * mottagare har inget eget fält för inköpsnumret: deras "Ert ordernummer" är vårt ordernummer.
 * Märkningen står däremot på deras orderpapper och faktura ("Märkning: …"), så numret följer med
 * där. Blir raden för lång kortas projektets namn, aldrig numret.
 */
export function supplierOrderName(project: string | null, customerPo: string | null | undefined): string | undefined {
  const po = cleanCustomerPo(customerPo);
  const reference = po ? `Inköpsnr ${po}` : "";
  const name = (project ?? "").trim();
  if (!reference) return name ? name.slice(0, ORDER_NAME_MAX) : undefined;
  const room = ORDER_NAME_MAX - reference.length - 3;
  return name && room > 0 ? `${name.slice(0, room).trim()} · ${reference}` : reference;
}

export interface SupplierRequestInput {
  orderNo: string;
  project: string | null;
  /** Beställarens eget inköpsnummer. Det står i orderns märkning hos verkstaden. */
  customerPo?: string | null;
  customer: { name: string; email: string; company: string | null };
  buyer: SupplierBuyer;
  delivery: Delivery;
  /** Orderns alla skyltar, med loggornas bilder inlagda (`withInlineLogoImages`). */
  badges: readonly BadgeDocument[];
  /** Återförsäljarens prislista från när ordern lades. Frakten följer alltid den, också på en direktorder. */
  purchaseList: PriceTable;
  /** Satt på en direktorder: kunden faktureras, till kundens pris. */
  direct?: DirectSale;
  fonts: FontEngine;
  /** Svartvit miniatyr av en graverad logga. */
  logoPng?: (logo: BadgeLogo) => string;
  /**
   * Följesedeln som verkstaden skriver ut och lägger i paketet: den korta länken dit, och hur
   * ordern ska packas. Båda står som egna rader på verkstadens orderpapper, på varje skylt.
   */
  packing?: { link: string; instruction: string };
  /** Adressen till bilden av skylt nummer `line` (från 1) i ordern, för verkstadens orderbekräftelse. */
  signImage?: (line: number) => string;
}

/**
 * Ordern som verkstaden ska ha den: dokument och produktionsfil per skylt, det
 * beställaren betalar per rad, frakten och leveransadressen. Priserna räknas
 * på hela ordern, så att trappsteget och startkostnaden blir samma som i
 * panelen. Beställaren är återförsäljaren, som betalar inköpspris, eller
 * kunden på en direktorder, som betalar sitt eget pris (`DirectSale`).
 */
export function buildSupplierRequest(input: SupplierRequestInput): SupplierOrderRequest {
  // Frakten följer orderns fraktsätt: upphämtning och express har ingen fraktkostnad i anropet.
  // Den räknas alltid på inköpslistan, så att den är samma i alla led.
  const price = resellerOrder(input.badges, withShippingMethod(input.purchaseList, shippingMethodOf(input.delivery)));
  const sale = input.direct ? priceWithPricing(input.badges, input.direct.pricing, input.direct.priceList, price.shippingSek) : null;
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
    // Bilden av just den här skylten: verkstaden visar den i orderbekräftelsen till kunden.
    if (input.signImage) document.partnerPreview = input.signImage(i + 1);
    // Följesedeln och packningen gäller hela ordern, men orderpappret ritar raderna per skylt.
    if (input.packing) {
      document.partnerSpecs = [
        ...(document.partnerSpecs ?? []),
        { label: "Följesedel", value: input.packing.link },
        { label: "Packning", value: input.packing.instruction },
      ];
    }
    return [
      {
        document: withImageRefs(document, images),
        productionSvg: renderBadgeSvg(badge, layoutBadge(badge, input.fonts), { mode: "production", fonts: input.fonts }),
        quantity: Math.max(1, Math.floor(badge.quantity)),
        reference: `${input.orderNo}-${i + 1}`,
        unitPriceSek: (sale ? sale.lines[i]?.unitSek : price.unitSek[i]) ?? 0,
      },
    ];
  });
  return {
    orderRef: input.orderNo,
    ...(supplierOrderName(input.project, input.customerPo) && { orderName: supplierOrderName(input.project, input.customerPo) }),
    buyer: input.buyer,
    customer: {
      name: input.customer.name,
      email: input.customer.email,
      ...(input.customer.company && { company: input.customer.company }),
    },
    shipping: {
      method: supplierShippingMethod(input.delivery, price.goodsSek, price.quantity, input.purchaseList),
      costSek: price.shippingSek,
      address: supplierAddress(input.delivery.address, notificationEmail(input)),
      // Kundens fritext om hur skyltarna ska skickas, och vad varje extra adress kostar när verkstaden delar upp ordern.
      ...(deliveryInstructionsOf(input.delivery) && { instructions: deliveryInstructionsOf(input.delivery) as string }),
      extraDeliverySek: extraDeliverySekOf(input.purchaseList.shipping),
    },
    lines,
    minimumTopUpSek: sale ? sale.minimumTopUpSek : price.minimumTopUpSek,
    goodsSek: sale ? sale.goodsSek : price.goodsSek,
    images,
  };
}

/** Anropets storlek i byte, som det skickas. */
export function requestBytes(request: SupplierOrderRequest): number {
  return Buffer.byteLength(JSON.stringify(request), "utf8");
}
