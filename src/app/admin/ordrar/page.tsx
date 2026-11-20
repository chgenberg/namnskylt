import Link from "next/link";
import { adminTenant } from "@/features/admin/guard";
import { OrderFilters } from "@/features/admin/order-filters";
import { OrderRow } from "@/features/admin/order-row";
import styles from "@/features/admin/admin.module.css";
import { engravedRows } from "@/engine";
import { inOrderListFilter, isOrderListFilter, ORDER_LIST_FILTERS, type OrderListFilter } from "@/lib/orders/list-status";
import type { StoredOrder } from "@/lib/orders/model";
import { listOrders } from "@/lib/orders/repository";
import { listStatusOf } from "@/lib/supplier/sync";
import { isOwner } from "@/lib/tenants/model";

interface OrdersPageProps {
  searchParams: Promise<{ q?: string; status?: string }>;
}

function matches(order: StoredOrder, query: string): boolean {
  if (!query) return true;
  const haystack = [
    order.orderNo,
    order.project ?? "",
    order.customer.name,
    order.customer.company ?? "",
    order.customer.email,
    ...order.badges.flatMap((b) => engravedRows(b).map((r) => r.text)),
  ]
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const tenant = await adminTenant();
  if (!tenant) return null;
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 100);
  // Två filter, I produktion och Skickad. Utan valt filter visas alla ordrar (besked via ägaren 2026-11-20).
  const active: OrderListFilter | null = isOrderListFilter(params.status) ? params.status : null;

  const orders = (await listOrders(tenant)).filter((o) => matches(o, query));
  const counts = Object.fromEntries(
    ORDER_LIST_FILTERS.map((filter) => [filter, orders.filter((o) => inOrderListFilter(listStatusOf(o), filter)).length]),
  ) as Record<OrderListFilter, number>;
  const shown = orders.filter((o) => inOrderListFilter(listStatusOf(o), active));

  return (
    <>
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Ordrar</p>
          <h1 className={styles.pageTitle}>Alla ordrar</h1>
          <p className={styles.pageLead}>Klicka på en order för detaljer, eller beställ samma sak igen direkt från raden.</p>
        </div>
        <Link href="/admin/ny-order" className="btn btn--primary">
          + Skapa order
        </Link>
      </header>
      <OrderFilters counts={counts} active={active} query={query} />
      {shown.length === 0 ? (
        <div className={styles.empty}>
          <strong>Inga ordrar här</strong>
          <span>{query ? `Inget matchar ”${query}”.` : active ? "Inga ordrar har det läget. Klicka på filtret igen för att se alla." : "Här står ordrarna när den första är lagd."}</span>
        </div>
      ) : (
        <div className={styles.listRows}>
          {shown.map((order) => (
            <OrderRow key={order.id} order={order} canDelete={isOwner(tenant)} />
          ))}
        </div>
      )}
    </>
  );
}
