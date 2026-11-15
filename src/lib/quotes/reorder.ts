import "server-only";
import { MAX_ORDER_BADGES } from "@/engine";
import { endPriceTable } from "@/engine/price-model";
import { isErasedCustomer } from "@/lib/orders/erase-model";
import { getOrderByCustomerToken, getPriceModel } from "@/lib/orders/repository";
import { staffBadges } from "@/lib/orders/repeat";
import { shopOrderPricing } from "@/lib/shops/price-list";
import { getShop } from "@/lib/shops/repository";
import { createQuote } from "./repository";
import { reorderMode, reorderPricing } from "./reorder-model";

export type ReorderResult = { ok: true; quotePath: string } | { ok: false; error: string };

/**
 * Kunden beställer fler skyltar med samma design från sin ordersida. Namnen
 * blir en offert som är klar att godkänna: kunden ser priset, bekräftar
 * leveransen och godkänner, precis som en offert från återförsäljaren. Länkens
 * kod är behörigheten. Ordern läggs först när offerten godkänns, och
 * återförsäljaren får besked då.
 */
export async function createReorderQuote(orderToken: string, names: string, quantity: number): Promise<ReorderResult> {
  const order = await getOrderByCustomerToken(orderToken);
  if (!order) return { ok: false, error: "Ordern finns inte" };
  const template = order.badges[0];
  const mode = reorderMode({ status: order.status, badges: order.badges, paid: order.payment !== null, erased: isErasedCustomer(order.customer) });
  if (mode !== "quote" || !template) return { ok: false, error: "Den här ordern går inte att beställa fler skyltar från." };
  const badges = staffBadges(template, names, quantity);
  if (badges.length === 0) return { ok: false, error: "Skriv minst ett namn." };
  if (badges.length > MAX_ORDER_BADGES) return { ok: false, error: `Högst ${MAX_ORDER_BADGES} namn per beställning.` };
  // En order från en butik följer butikens priser. Annars gäller listpris, med kundens rabatt om den har en.
  const shop = order.shopSlug ? await getShop(order.shopSlug) : null;
  const pricing = shop ? shopOrderPricing(badges, shop.priceList, endPriceTable(await getPriceModel())) : reorderPricing(order.pricing);
  const quote = await createQuote({
    tenant: order.resellerId,
    customerId: order.customer.id,
    badges,
    demo: order.demo,
    project: `Fler skyltar, samma design som ${order.orderNo}`,
    // Samma leverans som sist. Kunden bekräftar eller ändrar den när offerten godkänns.
    delivery: order.delivery,
    pricing,
    reorderOf: { orderId: order.id, orderNo: order.orderNo },
  });
  return { ok: true, quotePath: `/offert/${quote.token}` };
}
