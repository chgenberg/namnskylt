import "server-only";
import type { Sql, TransactionSql } from "postgres";
import { z } from "zod";
import { badgeDocumentSchema } from "@/engine";
import type { PriceModel } from "@/engine/price-model";
import { isOwner } from "@/lib/tenants/model";
import { parseDelivery, shippingMethodOf } from "./delivery";
import { isDirectOrder, isOrderStatus } from "./model";
import { storedPriceModel } from "./price-lists";
import { parsePricing } from "./pricing";
import { DIRECT_SELLER_NAME, directOrderShare, orderShare, type ResellerOrderRow } from "./provision";

const badgesSchema = z.array(badgeDocumentSchema);

interface ShareRow {
  order_no: string;
  status: string;
  badges: unknown;
  pricing: unknown;
  price_model: unknown;
  delivery: unknown;
  payment: unknown;
  express_shipping_sek: number | null;
  extra_delivery_sek: number;
  total_sek: number;
  placed_at: Date;
  reseller_id: string;
  reseller_name: string | null;
  customer_name: string;
  customer_company: string | null;
}

/**
 * Alla ordrar som verkstaden fakturerar, nyast först, med fördelningen mellan
 * parterna: återförsäljarnas ordrar och direktordrarna hos namnskylt.com, där
 * verkstaden fakturerar kunden. Demoordrar, avbrutna ordrar och ordrar betalda
 * med kort är inte med. Varje order räknas med modellen den sparades med;
 * `currentModel` gäller rader utan sparad modell.
 * Anroparen ansvarar för att bara admin får svaret.
 *
 * Läser alla ordrar varje gång. Det håller så länge de är få; sedan behövs ett
 * periodfilter eller att fördelningen sparas när ordern läggs.
 */
export async function listResellerOrders(sql: Sql | TransactionSql, currentModel: PriceModel): Promise<ResellerOrderRow[]> {
  const rows = await sql<ShareRow[]>`
    select o.order_no, o.status, o.badges, o.pricing, o.price_model, o.delivery, o.payment, o.express_shipping_sek, o.extra_delivery_sek, o.total_sek, o.placed_at, o.reseller_id,
           a.name as reseller_name, c.name as customer_name, c.company as customer_company
      from orders o
      join customers c on c.id = o.customer_id
      left join reseller_accounts a on a.id = o.reseller_id
     where not o.is_demo and o.status <> 'cancelled'
     order by o.placed_at desc`;
  return rows.flatMap((row) => {
    const badges = badgesSchema.safeParse(row.badges);
    if (!badges.success || !isOrderStatus(row.status)) {
      console.error(`Ordern ${row.order_no} gick inte att läsa för provisionen`);
      return [];
    }
    const direct = isDirectOrder({ resellerId: row.reseller_id, payment: row.payment });
    // En order hos namnskylt.com som kunden har betalat med kort fakturerar verkstaden inte kunden: den hör inte hit.
    if (isOwner(row.reseller_id) && !direct) return [];
    const model = storedPriceModel(row.price_model, currentModel);
    const method = shippingMethodOf(parseDelivery(row.delivery));
    return [
      {
        orderNo: row.order_no,
        placedAt: row.placed_at.toISOString(),
        status: row.status,
        resellerId: row.reseller_id,
        resellerName: direct ? DIRECT_SELLER_NAME : (row.reseller_name ?? row.reseller_id),
        customer: row.customer_company ?? row.customer_name,
        customerSek: row.total_sek,
        // En direktorder faktureras kunden, till kundens pris. Då är plattformens del marginalen.
        share: direct
          ? directOrderShare(badges.data, parsePricing(row.pricing), model, method, row.express_shipping_sek, row.extra_delivery_sek)
          : orderShare(badges.data, model, method, row.express_shipping_sek, row.extra_delivery_sek),
      },
    ];
  });
}
