/**
 * Kontraktet mot Skylt & Gravyrteknik. Dokumentformen är en delmängd av
 * skyltmotorns `SignDocument` (productType "sign"), så leverantören kan
 * produktionsrendera ordern med sin befintliga motor. Resten av ordern följer
 * deras `Order`: beställare som faktureras, leveransadress, fraktsätt, vår
 * referens och priset per rad.
 */

export interface SupplierTextRow {
  id: string;
  text: string;
  capHeightMm: number;
  align: "left" | "center" | "right";
  bold: boolean;
  italic: false;
  locked: false;
  /**
   * Kundens hexfärg för radens tryck (`#RRGGBB`), deras `TextRow.color`. Bara
   * när namnet printas; deras motor läser fältet på tryckta skyltar.
   */
  color?: string;
}

export type SupplierLayer =
  | {
      id: string;
      transform: { position: { x: number; y: number }; rotationDeg: 0 };
      visible: true;
      locked: false;
      data: { kind: "text"; rows: SupplierTextRow[]; font: string; lineHeightRatio: number };
    }
  | {
      id: string;
      transform: { position: { x: number; y: number }; rotationDeg: 0 };
      visible: true;
      locked: false;
      data: { kind: "frame"; thicknessMm: number; paddingMm: number; style: "solid" | "double" };
    }
  | {
      id: string;
      /** Bildlagrets position är rutans mittpunkt. */
      transform: { position: { x: number; y: number }; rotationDeg: 0 };
      visible: true;
      locked: false;
      data:
        | {
            kind: "image";
            /** PNG-miniatyr för allt hos leverantören som bara läser bilder. Se `SupplierOrderRequest.images`. */
            src: string;
            widthMm: number;
            heightMm: number;
            renderMode: "engrave";
            lockAspect: true;
            /** Banorna som graveras — samma som i vår produktionsfil. */
            vector: { markup: string; viewWidth: number; viewHeight: number };
          }
        | {
            kind: "image";
            /**
             * Bilden som trycks: loggan i färg som PNG med genomskinlig botten. Se
             * `SupplierOrderRequest.images`. Tom när lagret bär `vector` i stället.
             */
            src: string;
            widthMm: number;
            heightMm: number;
            renderMode: "print";
            lockAspect: true;
            /**
             * Det som printas i en färg, som banor: namnet, ramen och en svartvit
             * logga. Varje bana har sin egen fyllnadsfärg, som verkstadens tryckfil
             * ritar rakt av. Bara absoluta `M`, `L`, `C` och `Z` och hex i gemener.
             */
            vector?: { markup: string; viewWidth: number; viewHeight: number };
          };
    };

/**
 * En rad på verkstadens orderpapper, som "Fäste" och "Nål". Verkstaden ritar varje rad för sig,
 * bland skyltens övriga uppgifter (besked av ägaren 2026-11-20: fästet ska ha en egen rad, inte
 * stå under Kommentar).
 */
export interface SupplierSpecRow {
  label: string;
  value: string;
}

export interface SupplierSignDocument {
  productType: "sign";
  material: string;
  color: string;
  shape: "rectangular" | "oval" | "round" | "hexagon" | "octagon" | "freeform";
  /** Egen form: hörnpunkter i mm, y nedåt — samma fält som skyltmotorns fria polygon. */
  customShapePoints?: { x: number; y: number }[];
  dimensions: { widthMm: number; heightMm: number; autoSize: false };
  cornerRadiusMm: number;
  mounting: string;
  holes: { type: "none"; count: 0; diameterMm: number; placement: "none" };
  layers: SupplierLayer[];
  /**
   * Samma uppgifter som `partnerSpecs`, i löptext. Verkstadens orderpapper ritar den som
   * "Kommentar" när raderna saknas, och de arbetsmoment som grupperar skyltar läser den.
   */
  productionNote?: string;
  /** Det verkstaden ska läsa om skylten utöver ritningen, en rad per uppgift. Fästet står alltid med. */
  partnerSpecs?: SupplierSpecRow[];
  /**
   * Bilden av skylten som kunden designade den, som PNG hos oss (`packingSignImageUrl`). Verkstaden visar
   * den i orderbekräftelsen till kunden (besked av ägaren 2026-11-24). Verkstadens egna dokument har inte
   * fältet, och deras mottagare sparar det med dokumentet utan att läsa det.
   */
  partnerPreview?: string;
  /**
   * Tryckfilen ska bära trycklagrets färger i CMYK (besked från Mats på verkstaden via ägaren
   * 2026-11-20). Verkstadens egna dokument har inte fältet, och deras tryckfil ritas då som förut.
   */
  printColorSpace?: "cmyk";
  /**
   * Tryckfärgerna för varje fyllnadsfärg i trycklagret, i procent: `#rrggbb` i gemener →
   * `[C, M, Y, K]`. Samma värden som kunden såg vid färgvalet (`hexCmyk`).
   */
  printCmyk?: Record<string, [number, number, number, number]>;
}

export interface SupplierOrderLine {
  document: SupplierSignDocument;
  quantity: number;
  /** Vår referens per rad, återkommer i leverantörens följesedel. */
  reference: string;
  /**
   * Det beställaren betalar per skylt, exkl. moms, med skyltens del av
   * startkostnaden inräknad: återförsäljarens inköpspris, eller kundens pris på
   * en direktorder. Leverantören fakturerar det priset, inte sin egen
   * prislista. Får ha ören.
   */
  unitPriceSek: number;
  /**
   * Färdig produktionsfil i mm med glyferna som konturer (röd = skär,
   * svart = gravyr) — facit om leverantörens rendering skulle skilja.
   */
  productionSvg: string;
}

export interface SupplierCustomer {
  name: string;
  email: string;
  company?: string;
}

/** Leveransadressen, samma fält som leverantörens `Address`. */
export interface SupplierAddress {
  /** Mottagaren på fraktsedeln: företaget eller personen. */
  name: string;
  /** Personen som tar emot när mottagaren är ett företag. */
  contactName?: string;
  line1: string;
  line2?: string;
  zip: string;
  city: string;
  country: "SE";
  phone?: string;
  /**
   * Dit transportören aviserar leveransen. namnskylt.coms egna kunder aviseras
   * direkt. Går skyltarna till en återförsäljares kund eller till
   * återförsäljaren själv är det återförsäljarens adress, så att verkstadens
   * namn inte hamnar i butikskundens inkorg (beslut av ägaren 2026-11-17).
   * Saknas vid upphämtning.
   */
  email?: string;
}

/** Beställarens fakturaadress som gata, postnummer och ort. */
export interface SupplierBillingAddress {
  line1: string;
  line2?: string;
  zip: string;
  city: string;
  country: "SE";
}

/**
 * Den som beställer hos leverantören och får fakturan: återförsäljaren, eller
 * kunden själv på en direktorder hos namnskylt.com. Leverantören känner igen
 * företaget på organisationsnumret och lägger upp det som företagskund första
 * gången.
 */
export interface SupplierBuyer {
  /**
   * Kontot ordern lades under hos oss: återförsäljarens id, eller `namnskylt`
   * för alla direktordrar. Det säger alltså inte vilket företag som beställer;
   * det gör organisationsnumret.
   */
  id: string;
  name: string;
  orgNumber: string;
  /** Dit fakturan och orderbekräftelsen går. */
  email: string;
  /**
   * Företagets vanliga adress, när den skiljer sig från `email`. Vi använder
   * den själva för att välja aviseringens adress (`shipping.address.email`):
   * fakturabrevlådan är fel ställe för ett besked om leverans. Leverantören
   * läser inte fältet i dag; orderbekräftelsen och statusmejlen går till `email`.
   */
  contactEmail?: string;
  phone?: string;
  /** Fakturaadressen som fri text, som den står i återförsäljarens uppgifter. */
  address?: string;
  /**
   * Samma adress tolkad, när den fria texten går att läsa som gata, postnummer
   * och ort. Leverantören lägger den på kundkortet när beställaren läggs upp.
   */
  billingAddress?: SupplierBillingAddress;
}

/**
 * Leverantörens fraktsätt, samma koder som `Order.shippingMethod` i skyltmotorn.
 * Express har ingen kostnad i anropet: verkstaden sätter den efter storlek och vikt.
 */
export type SupplierShippingMethod = "postnord-varubrev" | "dhl-paket" | "postnord-express" | "pickup-hogsbo";

export interface SupplierShipping {
  method: SupplierShippingMethod;
  /** Frakten återförsäljaren betalar, exkl. moms. Samma belopp som leverantörens egen prislista ger. */
  costSek: number;
  address: SupplierAddress;
  /**
   * Leveransspecifikationen: kundens fritext om hur skyltarna ska skickas, till exempel vilka namn
   * som ska till vilken adress. Verkstaden delar upp ordern i leveranser efter den. Saknas när
   * kunden inte skrev något.
   */
  instructions?: string;
  /**
   * Frakten för varje leveransadress utöver den första, i hela kronor exkl. moms. Verkstaden lägger
   * den på ordern när den delar upp den i leveranser (beslut av ägaren 2026-11-23).
   */
  extraDeliverySek?: number;
}

export interface SupplierOrderRequest {
  /**
   * Vårt ordernummer. Leverantören sparar det som kundens referens
   * (`customerPo`), och samma nummer får aldrig ge två ordrar: ett upprepat
   * anrop svarar med ordern som redan finns. Skickas också i huvudet
   * `Idempotency-Key`.
   */
  orderRef: string;
  /** Projektets namn, leverantörens `orderName`. */
  orderName?: string;
  buyer: SupplierBuyer;
  /** Slutkunden skyltarna är till. Bara en referens på följesedeln; fakturan går till `buyer`. */
  customer: SupplierCustomer;
  shipping: SupplierShipping;
  lines: SupplierOrderLine[];
  /** Påslaget upp till minsta ordervärde, exkl. moms. Leverantörens `minOrderAdjustment`. */
  minimumTopUpSek: number;
  /** Varuvärdet leverantören fakturerar, exkl. moms och frakt: raderna gånger antal plus påslaget. */
  goodsSek: number;
  /**
   * Bilderna som dokumenten pekar på, en gång var. En rads bildlager har
   * `src: "image:<nyckel>"`, och leverantören lägger in bilden härifrån innan
   * dokumentet sparas. Hundra namn med samma logga blir då en bild i anropet,
   * inte hundra.
   */
  images: Record<string, string>;
}

export interface SupplierOrderReceipt {
  orderNumber: string;
  status: "received" | "mock";
  estimatedShipDate: string;
}

/**
 * Leverantörens orderstatusar, samma koder som i deras system
 * (`packages/shared/src/order.ts` i skyltmotorn).
 */
export const SUPPLIER_ORDER_STATUSES = [
  "draft",
  "submitted",
  "in_review",
  "in_production",
  "completed",
  "shipped",
  "delivered",
  "cancelled",
] as const;
export type SupplierOrderStatus = (typeof SUPPLIER_ORDER_STATUSES)[number];

/**
 * Orderns läge hos leverantören. Svaret på `GET /orders/{orderNumber}` och
 * kroppen i webhooken `order.status_changed` mot `/api/supplier/webhook`.
 */
export interface SupplierOrderState {
  orderNumber: string;
  status: SupplierOrderStatus;
  trackingUrl?: string | null;
  /**
   * Fraktens pris i hela kronor, exklusive moms, när verkstaden har satt det.
   * Läses bara för en order med expressfrakt, där priset inte är känt när ordern läggs.
   */
  shippingCost?: number | null;
  /**
   * Leveranserna när personalen har delat ordern på flera adresser (fliken Namnskylt hos
   * verkstaden, beslut av ägaren 2026-11-23). Tom när allt går till orderns adress. Saknas
   * fältet har verkstaden inte skickat något om leveranser, och det vi har sparat står kvar.
   */
  deliveries?: SupplierDelivery[];
  /** Frakten för leveranserna utöver den första, hela kronor exkl. moms. 0 när ordern inte är uppdelad. */
  extraDeliveryCost?: number;
  /** När statusen sattes hos leverantören (ISO 8601). */
  changedAt: string;
}

/** En leverans av en uppdelad order, som verkstaden har den. */
export interface SupplierDelivery {
  /** Leveransens nummer, från 1. Följesedeln för leveransen är `/f/<kod>?leverans=<position>`. */
  position: number;
  name: string;
  contactName: string | null;
  line1: string;
  line2: string | null;
  zip: string;
  city: string;
  country: string;
  phone: string | null;
  email: string | null;
  /** Radernas nummer i anropet, från 1: rad n är orderns n:te skylt som verkstaden gör. */
  lines: number[];
  trackingUrl: string | null;
}

export interface SupplierClient {
  placeOrder(request: SupplierOrderRequest): Promise<SupplierOrderReceipt>;
  /** `null` när leverantören inte känner till ordern. */
  getOrder(orderNumber: string): Promise<SupplierOrderState | null>;
}
