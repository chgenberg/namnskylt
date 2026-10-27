import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/orders/model";
import styles from "./admin.module.css";

export function StatusPill({ status }: { status: OrderStatus }) {
  return (
    <span className={styles.status} data-status={status}>
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}
