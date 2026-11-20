import { ORDER_LIST_STATUS_HINT, ORDER_LIST_STATUS_LABEL, type OrderListStatus } from "@/lib/orders/list-status";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/orders/model";
import styles from "./admin.module.css";

export function StatusPill({ status }: { status: OrderStatus }) {
  return (
    <span className={styles.status} data-status={status}>
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}

/** Märket i listorna, som bara skiljer på I produktion och Skickad (och undantagen Väntar och Avbruten). */
export function ListStatusPill({ status }: { status: OrderListStatus }) {
  return (
    <span className={styles.status} data-status={status} title={ORDER_LIST_STATUS_HINT[status]}>
      {ORDER_LIST_STATUS_LABEL[status]}
    </span>
  );
}
