import { QUOTE_STATUS_LABEL, type QuoteDisplayStatus } from "@/lib/quotes/model";
import styles from "./admin.module.css";

export function QuoteStatusPill({ status }: { status: QuoteDisplayStatus }) {
  return (
    <span className={styles.status} data-status={status}>
      {QUOTE_STATUS_LABEL[status]}
    </span>
  );
}

const FLOW: readonly { id: "draft" | "sent" | "accepted"; label: string }[] = [
  { id: "draft", label: "Utkast" },
  { id: "sent", label: "Skickad till kunden" },
  { id: "accepted", label: "Godkänd → order" },
];

/** Tre steg; nekad, utgången och makulerad visas i stället för sista steget. */
export function QuoteFlow({ status }: { status: QuoteDisplayStatus }) {
  const reached = status === "accepted" ? 2 : status === "draft" ? 0 : 1;
  const ended = status === "declined" || status === "expired" || status === "cancelled";
  return (
    <ol className={styles.quoteFlow} aria-label="Offertens steg">
      {FLOW.map((step, i) => {
        if (ended && i === 2) {
          return (
            <li key={step.id} className={styles.quoteStep} data-state="off">
              {QUOTE_STATUS_LABEL[status]}
            </li>
          );
        }
        const state = i < reached || (i === reached && status === "accepted") ? "done" : i === reached ? "current" : "todo";
        return (
          <li key={step.id} className={styles.quoteStep} data-state={state}>
            {state === "done" ? "✓ " : ""}
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}
