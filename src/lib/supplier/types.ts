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
            /** Bilden som trycks: loggan i färg som PNG med genomskinlig botten. Se `SupplierOrderRequest.images`. */
            src: string;
            widthMm: number;
            heightMm: number;
            renderMode: "print";
            lockAspect: true;
          };
    };

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
  productionNote?: string;
}

export interface SupplierOrderLine {
  document: SupplierSignDocument;
  quantity: number;
  /** Vår referens per rad, återkommer i leverantörens följesedel. */
  reference: string;
  /**
   * Det återförsäljaren betalar per skylt, exkl. moms, med skyltens del av
   * startkostnaden inräknad. Leverantören fakturerar det priset, inte sin egen
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
}

/**
 * Den som beställer hos leverantören och får fakturan: återförsäljaren.
 * Leverantören lägger upp den som företagskund första gången och känner sedan
 * igen den på `id`.
 */
export interface SupplierBuyer {
  /** Vårt id för återförsäljaren. Ändras aldrig. */
  id: string;
  name: string;
  orgNumber: string;
  /** Dit fakturan och orderbekräftelsen går. */
  email: string;
  phone?: string;
  /** Fakturaadressen som fri text, som den står i återförsäljarens uppgifter. */
  address?: string;
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
  /** När statusen sattes hos leverantören (ISO 8601). */
  changedAt: string;
}

export interface SupplierClient {
  placeOrder(request: SupplierOrderRequest): Promise<SupplierOrderReceipt>;
  /** `null` när leverantören inte känner till ordern. */
  getOrder(orderNumber: string): Promise<SupplierOrderState | null>;
}
