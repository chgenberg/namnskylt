import "server-only";
import type { Sql, TransactionSql } from "postgres";
import { z } from "zod";
import { badgeDocumentSchema } from "@/engine";
import type { PriceModel } from "@/engine/price-model";
import { OWNER_TENANT } from "@/lib/tenants/model";
import { parseDelivery, shippingMethodOf } from "./delivery";
import { isOrderStatus } from "./model";
import { storedPriceModel } from "./price-lists";
import { orderShare, type ResellerOrderRow } from "./provision";

const badgesSchema = z.array(badgeDocumentSchema);

interface ShareRow {
  order_no: string;
  status: string;
  badges: unknown;
  price_model: unknown;
  delivery: unknown;
  express_shipping_sek: number | null;
  total_sek: number;
  placed_at: Date;
  reseller_id: string;
  reseller_name: string | null;
  customer_name: string;
  customer_company: string | null;
}

/**
 * Alla återförsäljares ordrar, nyast först, med fördelningen mellan parterna.
 * Ägarens egna ordrar, demoordrar och avbrutna ordrar är inte med. Varje order
 * räknas med modellen den sparades med; `currentModel` gäller rader utan sparad modell.
 * Anroparen ansvarar för att bara admin får svaret.
 *
 * Läser alla ordrar varje gång. Det håller så länge de är få; sedan behövs ett
 * periodfilter eller att fördelningen sparas när ordern läggs.
 */
export async function listResellerOrders(sql: Sql | TransactionSql, currentModel: PriceModel): Promise<ResellerOrderRow[]> {
  const rows = await sql<ShareRow[]>`
    select o.order_no, o.status, o.badges, o.price_model, o.delivery, o.express_shipping_sek, o.total_sek, o.placed_at, o.reseller_id,
           a.name as reseller_name, c.name as customer_name, c.company as customer_company
      from orders o
      join customers c on c.id = o.customer_id
      left join reseller_accounts a on a.id = o.reseller_id
     where o.reseller_id <> ${OWNER_TENANT} and not o.is_demo and o.status <> 'cancelled'
     order by o.placed_at desc`;
  return rows.flatMap((row) => {
    const badges = badgesSchema.safeParse(row.badges);
    if (!badges.success || !isOrderStatus(row.status)) {
      console.error(`Ordern ${row.order_no} gick inte att läsa för provisionen`);
      return [];
    }
    return [
      {
        orderNo: row.order_no,
        placedAt: row.placed_at.toISOString(),
        status: row.status,
        resellerId: row.reseller_id,
        resellerName: row.reseller_name ?? row.reseller_id,
        customer: row.customer_company ?? row.customer_name,
        customerSek: row.total_sek,
        share: orderShare(
          badges.data,
          storedPriceModel(row.price_model, currentModel),
          shippingMethodOf(parseDelivery(row.delivery)),
          row.express_shipping_sek,
        ),
      },
    ];
  });
}
