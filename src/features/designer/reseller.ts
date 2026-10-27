import type { PurchaseTerms } from "@/lib/orders/purchase";

/** Designern öppnad av återförsäljaren för att lägga en order eller göra en offert åt en kund. */
export interface ResellerOrderContext {
  customerId: string;
  customerName: string;
  /** `quote` sparar en offert — inget går till tillverkningen förrän kunden godkänt. */
  mode: "order" | "quote";
  /** Inköpsvillkoren hos tryckeriet; `null` innan de ställts in. Skickas bara till inloggad återförsäljare. */
  purchase: PurchaseTerms | null;
}
