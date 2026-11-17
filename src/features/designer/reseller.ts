import type { BadgeGroup, PriceTable } from "@/engine";
import type { DeliveryOptions } from "@/lib/orders/delivery";
import type { ShopPriceList } from "@/lib/shops/price-list";

/** Skyltmotorn i en återförsäljares demobutik — ordern märks med butiken. */
export interface ShopContext {
  slug: string;
  name: string;
  /** Butikens priser mot riktpris; saknas = riktpris. */
  priceList?: ShopPriceList | null;
  /**
   * Butiken har ingen återförsäljare som ägare. Då är ordern en direktorder hos
   * namnskylt.com: Skylt & Gravyrteknik bekräftar och fakturerar kunden.
   */
  direct?: boolean;
}

/** En tidigare order som öppnas i skyltmotorn för att beställas igen, med ändringar. */
export interface OrderCopy {
  orderNo: string;
  groups: BadgeGroup[];
}

/** Designern öppnad av återförsäljaren för att lägga en order eller göra en offert åt en kund. */
export interface ResellerOrderContext {
  customerId: string;
  customerName: string;
  /** `quote` sparar en offert — inget går till tillverkningen förrän kunden godkänt. */
  mode: "order" | "quote";
  /** Offertens rubrik, satt innan skyltmotorn öppnades. */
  project?: string;
  /** Återförsäljarens inköpspriser, för inköp och marginal. Skickas bara till en inloggad återförsäljare. */
  purchaseList: PriceTable;
  /** Förifyllda leveransadresser: kundens och återförsäljarens egen. */
  delivery: DeliveryOptions;
  /**
   * En tidigare order som öppnas för ändring ("Beställ igen" med andra namn
   * eller antal). Dess skyltar ligger i varukorgen när skyltmotorn öppnas.
   */
  copy?: OrderCopy;
}
