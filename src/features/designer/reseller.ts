import type { ShopPriceList } from "@/lib/shops/price-list";
import type { PurchaseTerms } from "@/lib/orders/purchase";

/** Skyltmotorn i en återförsäljares demobutik — ordern märks med butiken. */
export interface ShopContext {
  slug: string;
  name: string;
  /** Butikens priser mot riktpris; saknas = riktpris. */
  priceList?: ShopPriceList | null;
}

/** Designern öppnad av återförsäljaren för att lägga en order eller göra en offert åt en kund. */
export interface ResellerOrderContext {
  customerId: string;
  customerName: string;
  /** `quote` sparar en offert — inget går till tillverkningen förrän kunden godkänt. */
  mode: "order" | "quote";
  /** Offertens rubrik, satt innan skyltmotorn öppnades. */
  project?: string;
  /** Inköpsvillkoren hos tryckeriet; `null` innan de ställts in. Skickas bara till inloggad återförsäljare. */
  purchase: PurchaseTerms | null;
}
