import Link from "next/link";
import { canViewAdmin } from "@/features/admin/guard";
import { OrderCard } from "@/features/admin/order-card";
import { OrderFilters, type StatusFilter } from "@/features/admin/order-filters";
import styles from "@/features/admin/admin.module.css";
import { engravedRows } from "@/engine";
import { isOpen, isOrderStatus, ORDER_STATUSES, type StoredOrder } from "@/lib/orders/model";
import { listOrders } from "@/lib/orders/repository";

interface OrdersPageProps {
  searchParams: Promise<{ q?: string; status?: string }>;
}

function matches(order: StoredOrder, query: string): boolean {
  if (!query) return true;
  const haystack = [
    order.orderNo,
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

function inFilter(order: StoredOrder, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "open") return isOpen(order);
  return order.status === filter;
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  if (!(await canViewAdmin())) return null;
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 100);
  const active: StatusFilter =
    params.status === "all" ? "all" : params.status && isOrderStatus(params.status) ? params.status : "open";

  const orders = (await listOrders()).filter((o) => matches(o, query));
  const counts = Object.fromEntries(
    (["open", "all", ...ORDER_STATUSES] as StatusFilter[]).map((f) => [f, orders.filter((o) => inFilter(o, f)).length]),
  ) as Record<StatusFilter, number>;
  const shown = orders.filter((o) => inFilter(o, active));

  return (
    <>
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Ordrar</p>
          <h1 className={styles.pageTitle}>Alla ordrar</h1>
          <p className={styles.pageLead}>Klicka på en order för detaljer, eller beställ samma sak igen direkt från kortet.</p>
        </div>
        <Link href="/admin/ny-order" className="btn btn--primary">
          + Skapa order
        </Link>
      </header>
      <OrderFilters counts={counts} active={active} query={query} />
      {shown.length === 0 ? (
        <div className={styles.empty}>
          <strong>Inga ordrar här</strong>
          <span>{query ? `Inget matchar ”${query}”.` : "Prova ett annat filter."}</span>
        </div>
      ) : (
        <div className={styles.cards}>
          {shown.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </>
  );
}
