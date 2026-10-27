import { formatDate } from "@/features/orders/format";
import { ORDER_STATUS_LABEL, stepTimes, TIMELINE_STEPS, type StoredOrder } from "@/lib/orders/model";
import styles from "./admin.module.css";

/** Stegen hittills, med tid och anteckning. Korrekturen visas bara om den användes. */
export function OrderTimeline({ order }: { order: StoredOrder }) {
  const times = stepTimes(order.events);
  const steps = TIMELINE_STEPS.filter((s) => s !== "proof-sent" || times["proof-sent"]);
  const currentIndex = order.status === "cancelled" ? -1 : steps.indexOf(order.status);
  const reached = Math.max(currentIndex, ...steps.map((s, i) => (times[s] ? i : -1)));
  const progress = steps.length > 1 ? (Math.max(0, reached) / (steps.length - 1)) * 100 : 0;
  const notes = new Map(order.events.filter((e) => e.note).map((e) => [e.status, e.note]));

  return (
    <ol className={styles.timeline} style={{ "--progress": `${progress}%` } as React.CSSProperties}>
      {steps.map((step, i) => {
        const state = i < reached || (i === reached && step === "delivered") ? "done" : i === reached ? "current" : "todo";
        const at = times[step];
        return (
          <li key={step} className={styles.step} data-state={state}>
            <span className={styles.dot} aria-hidden="true" />
            <div>
              <div className={styles.stepLabel}>{ORDER_STATUS_LABEL[step]}</div>
              {at && <div className={styles.stepTime}>{formatDate(at)}</div>}
              {notes.get(step) && <div className={styles.stepNote}>{notes.get(step)}</div>}
            </div>
          </li>
        );
      })}
      {order.status === "cancelled" && (
        <li className={styles.step} data-state="current">
          <span className={styles.dot} aria-hidden="true" />
          <div>
            <div className={styles.stepLabel}>{ORDER_STATUS_LABEL.cancelled}</div>
            {times.cancelled && <div className={styles.stepTime}>{formatDate(times.cancelled)}</div>}
          </div>
        </li>
      )}
    </ol>
  );
}
