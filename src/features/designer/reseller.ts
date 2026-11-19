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

/** En av säljarens kunder, att välja i varukorgen. */
export interface CustomerChoice {
  id: string;
  /** Företaget, eller personen när kunden saknar företag. */
  label: string;
  /** Kontaktperson och e-post. */
  detail: string;
  /** Dit en offert mejlas. */
  email: string;
  /**
   * En demokund ur panelens demodata. Allt som görs till den blir demo: offerten mejlas inte,
   * och ordern skickas aldrig till verkstaden. Säljaren ska se det innan något skapas.
   */
  demo?: boolean;
}

/** Designern öppnad av återförsäljaren för att lägga en order eller göra en offert åt en kund. */
export interface ResellerOrderContext {
  /**
   * Kunden ordern eller offerten gäller. `null` när den som är inloggad i panelen har gått rakt
   * till skyltmotorn: kunden väljs då bland de gamla, eller fylls i som ny, i varukorgen
   * (besked av ägaren 2026-11-17).
   */
  customerId: string | null;
  customerName: string;
  /** Kunden som är vald i förväg är en demokund, se `CustomerChoice.demo`. */
  customerDemo?: boolean;
  /** `quote` sparar en offert — inget går till tillverkningen förrän kunden godkänt. */
  mode: "order" | "quote";
  /** Offertens rubrik, satt innan skyltmotorn öppnades. */
  project?: string;
  /**
   * Återförsäljarens inköpspriser, för inköp och marginal. Skickas bara till en inloggad
   * återförsäljare (besked av ägaren 2026-11-18). Admin är ingen återförsäljare och får dem inte:
   * hos namnskylt.com fakturerar verkstaden kunden slutkundens pris, så bara det priset visas.
   */
  purchaseList?: PriceTable;
  /** Förifyllda leveransadresser: kundens och återförsäljarens egen. */
  delivery: DeliveryOptions;
  /**
   * En tidigare order som öppnas för ändring ("Beställ igen" med andra namn
   * eller antal). Dess skyltar ligger i varukorgen när skyltmotorn öppnas.
   */
  copy?: OrderCopy;
  /** Säljarens kunder att välja bland i varukorgen, när ingen kund är vald i förväg. */
  customers?: readonly CustomerChoice[];
  /** En ny kund behöver företag och organisationsnummer: hos namnskylt.com fakturerar Skylt & Gravyrteknik kunden. */
  needsInvoiceDetails?: boolean;
  /** Offertmejlet är påslaget: offerten mejlas till kunden direkt när den skapas. */
  quoteEmail?: boolean;
}
