import Link from "next/link";
import { BadgePreview } from "@/components/badge-preview";
import { CopyOrderLink } from "@/components/copy-order-link";
import { engravedRows, type BadgeDocument } from "@/engine";
import { accountPaths } from "@/lib/customer-auth/model";
import { formatDay, formatSek } from "@/lib/format";
import { badgeCount, ORDER_STATUS_LABEL, type StoredOrder } from "@/lib/orders/model";
import styles from "./account.module.css";

interface AccountOrdersProps {
  orders: readonly StoredOrder[];
  shop: string | null;
}

/** Texten på en skylt, som den står på skylten: "Anna Lind, Säljare". */
function badgeText(badge: BadgeDocument): string {
  return engravedRows(badge)
    .map((row) => row.text.trim())
    .filter(Boolean)
    .join(", ");
}

/** Vad ordern innehåller, kort: första skyltens text och hur många fler som är med. */
function contents(order: StoredOrder): string {
  const first = order.badges[0];
  const name = first ? badgeText(first) || "Utan text" : "Inga skyltar";
  const more = order.badges.length - 1;
  return more > 0 ? `${name} och ${more} till` : name;
}

/** Kontots ordrar, nyast först. Varje order går att följa och att kopiera till en ny order. */
export function AccountOrders({ orders, shop }: AccountOrdersProps) {
  const paths = accountPaths(shop);
  if (orders.length === 0) {
    return (
      <div className={styles.empty}>
        <strong>Inga ordrar på kontot än</strong>
        <span>Ordrar du lägger när du är inloggad visas här, och går att kopiera till en ny order med ett par klick.</span>
        <Link href={paths.designer} className="btn btn--primary">
          Skapa skylt
        </Link>
      </div>
    );
  }
  return (
    <ul className={styles.orders}>
      {orders.map((order) => {
        const first = order.badges[0];
        const quantity = badgeCount(order);
        return (
          <li key={order.id} className={styles.order}>
            {first && <BadgePreview doc={first} className={styles.orderBadge} label={`Skylt: ${badgeText(first)}`} />}
            <div className={styles.orderBody}>
              <p className={styles.orderHead}>
                <span className="mono">{order.orderNo}</span>
                <span>{formatDay(order.placedAt)}</span>
                <span className={styles.status} data-status={order.status}>
                  {ORDER_STATUS_LABEL[order.status]}
                </span>
              </p>
              <p className={styles.orderText}>{contents(order)}</p>
              <p className={styles.orderMeta}>
                {quantity} {quantity === 1 ? "skylt" : "skyltar"} · {formatSek(order.totalSek)} exkl. moms
              </p>
              <div className={styles.orderActions}>
                {order.badges.length > 0 && (
                  // Den gamla ordern ändras aldrig: skyltarna öppnas i skyltmotorn som en ny order.
                  <CopyOrderLink href={paths.reorder(order.orderNo)} className="btn btn--primary">
                    Kopiera order
                  </CopyOrderLink>
                )}
                <Link href={`/order/${order.customerToken}`} className="btn">
                  Visa order
                </Link>
                {order.trackingUrl && (
                  <a href={order.trackingUrl} target="_blank" rel="noreferrer" className="btn">
                    Följ försändelsen
                  </a>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
