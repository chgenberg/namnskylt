import "server-only";
import type { Sql, TransactionSql } from "postgres";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { isTrackableSupplierOrder } from "@/lib/supplier/status";
import { isOwner } from "@/lib/tenants/model";
import { parseDelivery } from "./delivery";
import { parseSupplierDeliveries } from "./supplier-deliveries";
import {
  ERASED_CUSTOMER_NAME,
  erasedBadges,
  erasedCustomerEmail,
  erasedDelivery,
  erasedSupplierDeliveries,
  isBookkeepingOrder,
  type CustomerErasure,
} from "./erase-model";

type Json = Parameters<Sql["json"]>[0];

interface OrderFacts {
  id: string;
  status: string;
  is_demo: boolean;
  supplier_sent_at: Date | null;
  supplier_order_no: string | null;
  paid: boolean;
  badges: unknown;
  delivery: unknown;
  supplier_deliveries: unknown;
}

/** Samma fråga som adminens översikt ställer: har verkstaden ordern? */
function sentToWorkshop(order: Pick<OrderFacts, "supplier_sent_at" | "supplier_order_no">): boolean {
  return Boolean(order.supplier_sent_at) || isTrackableSupplierOrder(order.supplier_order_no);
}

function keeps(order: OrderFacts): boolean {
  return isBookkeepingOrder({ demo: order.is_demo, status: order.status, sentToWorkshop: sentToWorkshop(order), paid: order.paid });
}

/** Kundens ordrar med det som avgör om de hör till bokföringen. Låser raderna när `lock` är satt. */
async function customerOrders(sql: Sql | TransactionSql, customerId: string, lock: boolean): Promise<OrderFacts[]> {
  return sql<OrderFacts[]>`
    select id, status, is_demo, supplier_sent_at, supplier_order_no, (payment is not null) as paid, badges, delivery, supplier_deliveries
      from orders where customer_id = ${customerId} ${lock ? sql`for update` : sql``}`;
}

/**
 * Vad som tas bort och behålls om kunden raderas nu, utan att något ändras.
 * `null` när kunden inte finns hos återförsäljaren.
 */
export async function customerErasurePlan(tenant: string, customerId: string): Promise<CustomerErasure | null> {
  if (!z.uuid().safeParse(customerId).success) return null;
  const sql = requireDb();
  const [customer] = await sql<{ quotes: number; designs: number }[]>`
    select (select count(*)::int from quotes q where q.customer_id = c.id) as quotes,
           (select count(*)::int from designs d where d.customer_id = c.id) as designs
      from customers c where c.id = ${customerId} and c.reseller_id = ${tenant}`;
  if (!customer) return null;
  const orders = await customerOrders(sql, customerId, false);
  const kept = orders.filter(keeps).length;
  return { quotes: customer.quotes, designs: customer.designs, ordersRemoved: orders.length - kept, ordersKept: kept };
}

/**
 * Tar bort kunden inom en pågående transaktion.
 *
 * Kundens offerter och mallar raderas, liksom ordrar som inte hör till
 * bokföringen. Blir inga ordrar kvar raderas kunden. Ordrar som hör till
 * bokföringen (`isBookkeepingOrder`) behålls utan personuppgifter: skyltarnas
 * text, stillbilden, kontaktpersonen i leveransen, noterna i tidslinjen och
 * svaret på korrekturet tas bort, och kunden avidentifieras men står kvar,
 * eftersom ordern pekar på den. Belopp, skylttyp och antal rörs inte.
 */
export async function eraseCustomerIn(tx: TransactionSql, tenant: string, customerId: string): Promise<CustomerErasure | null> {
  if (!z.uuid().safeParse(customerId).success) return null;
  const [customer] = await tx<{ id: string; company: string | null; email: string }[]>`
    select id, company, email from customers where id = ${customerId} and reseller_id = ${tenant} for update`;
  if (!customer) return null;
  // Kundens eget konto bär samma uppgifter och tas bort med kunden: på namnskylt.com och i butiker
  // utan ägare för namnskylt.coms kunder, i återförsäljarens butiker för dess kunder. Kontot känns
  // igen på e-postadressen, eller på att kundens ordrar ligger på det: den som är inloggad kan
  // beställa med en annan adress än kontots.
  await tx`
    delete from customer_accounts a
     where (a.email = ${customer.email} or a.id in (select o.account_id from orders o where o.customer_id = ${customerId}))
       and ${
         isOwner(tenant)
           ? tx`(a.shop_slug is null or exists (select 1 from shops s where s.slug = a.shop_slug and s.owner_id is null))`
           : tx`exists (select 1 from shops s where s.slug = a.shop_slug and s.owner_id = ${tenant})`
       }`;
  const orders = await customerOrders(tx, customerId, true);
  const kept = orders.filter(keeps);
  const removed = orders.filter((order) => !keeps(order)).map((order) => order.id);
  const all = orders.map((order) => order.id);

  const quotes = await tx`delete from quotes where customer_id = ${customerId} returning id`;
  const designs = await tx`delete from designs where customer_id = ${customerId} returning id`;

  if (all.length > 0) {
    // En betalning som väntade bär kundens uppgifter. Raden står kvar tom, så att samma betalning aldrig ger en ny order.
    await tx`update checkouts set payload = '{}'::jsonb where order_id in ${tx(all)}`;
  }
  if (removed.length > 0) {
    await tx`update orders set repeat_of = null where repeat_of in ${tx(removed)}`;
    await tx`update quotes set order_id = null where order_id in ${tx(removed)}`;
    await tx`delete from orders where id in ${tx(removed)}`;
  }
  for (const order of kept) {
    const hasCompany = Boolean(customer.company?.trim());
    const original = parseDelivery(order.delivery);
    const delivery = erasedDelivery(original, hasCompany);
    const split = parseSupplierDeliveries(order.supplier_deliveries);
    const deliveries = split.length > 0 ? erasedSupplierDeliveries(split, original?.to ?? null, hasCompany) : null;
    // En order som står kvar för bokföringen visas inte längre på något kundkonto.
    await tx`
      update orders set badge_shot = null, account_id = null,
             badges = ${tx.json(erasedBadges(order.badges) as Json)},
             delivery = ${delivery ? tx.json(delivery as unknown as Json) : null},
             supplier_deliveries = ${deliveries ? tx.json(deliveries as unknown as Json) : null}
       where id = ${order.id}`;
  }
  if (kept.length > 0) {
    const ids = kept.map((order) => order.id);
    // Noter och korrektursvar är fri text som kan nämna kunden eller de anställda.
    await tx`update order_events set note = null where order_id in ${tx(ids)}`;
    await tx`update proofs set comment = null where order_id in ${tx(ids)}`;
    await tx`delete from notices where order_id in ${tx(ids)}`;
    await tx`
      update customers set name = ${ERASED_CUSTOMER_NAME}, email = ${erasedCustomerEmail(customerId)},
             phone = null, address = null, erased_at = now()
       where id = ${customerId}`;
  } else {
    await tx`delete from customers where id = ${customerId}`;
  }
  return { quotes: quotes.length, designs: designs.length, ordersRemoved: removed.length, ordersKept: kept.length };
}

/**
 * Tar bort en kund för gott, i en transaktion. Svarar med vad som togs bort
 * och vad som behölls, eller `null` när kunden inte finns hos återförsäljaren.
 */
export async function eraseCustomer(tenant: string, customerId: string): Promise<CustomerErasure | null> {
  const sql = requireDb();
  return sql.begin((tx) => eraseCustomerIn(tx, tenant, customerId));
}
