import Link from "next/link";
import { ClearSavedWork } from "@/components/clear-saved-work";
import styles from "./payment.module.css";

/**
 * `paid` = ordern är betald och lagd. `pending` = Stripe har inte bekräftat
 * betalningen än. `failed` = betald, men ordern gick inte att lägga.
 * `unknown` = adressen hör inte till någon betalning. `cancelled` = kunden avbröt.
 */
export type PaymentView =
  | { status: "paid"; orderNumber: string; shipDate: string; orderPath: string }
  | { status: "pending" }
  | { status: "failed" }
  | { status: "unknown" }
  | { status: "cancelled"; resumeHref: string };

const COPY: Record<PaymentView["status"], { eyebrow: string; title: string }> = {
  paid: { eyebrow: "Betalningen är klar", title: "Tack för din beställning" },
  pending: { eyebrow: "Betalning", title: "Betalningen behandlas" },
  failed: { eyebrow: "Betalning", title: "Betalningen är mottagen" },
  unknown: { eyebrow: "Betalning", title: "Vi hittar ingen betalning" },
  cancelled: { eyebrow: "Betalning", title: "Betalningen avbröts" },
};

/** Sidan kunden kommer tillbaka till från kortbetalningen. */
export function PaymentResult({ view }: { view: PaymentView }) {
  const copy = COPY[view.status];
  return (
    <div className={styles.page}>
      {/* Ordern är betald: varukorgen som låg kvar under betalningen ska inte komma tillbaka i skyltmotorn. */}
      {view.status === "paid" && <ClearSavedWork />}
      <article className={styles.card} role="status">
        <p className={styles.eyebrow}>{copy.eyebrow}</p>
        <h1 className={styles.title}>{copy.title}</h1>
        {view.status === "paid" && (
          <p className={styles.text}>
            Order <strong>{view.orderNumber}</strong> är betald och mottagen. Beräknat skickdatum är {view.shipDate}.
          </p>
        )}
        {view.status === "pending" && (
          <p className={styles.text}>
            Vi väntar på besked från betalningen. Ladda om sidan om en liten stund. Du behöver inte betala igen.
          </p>
        )}
        {view.status === "failed" && (
          <p className={styles.text}>
            Din betalning har gått igenom, men ordern kunde inte registreras av sig själv. Vi ser det och hör av oss. Du
            behöver inte betala igen.
          </p>
        )}
        {view.status === "unknown" && (
          <p className={styles.text}>Adressen hör inte till någon betalning hos oss. Ingenting har dragits härifrån.</p>
        )}
        {view.status === "cancelled" && (
          <p className={styles.text}>Ingen order är lagd och inget har dragits. Din skylt finns kvar om du vill fortsätta.</p>
        )}
        <div className={styles.actions}>
          {view.status === "paid" && (
            <Link href={view.orderPath} className="btn btn--primary">
              Följ din order
            </Link>
          )}
          {view.status === "cancelled" ? (
            <Link href={view.resumeHref} className="btn btn--primary">
              Tillbaka till skylten
            </Link>
          ) : (
            <Link href="/skapa" className="btn btn--ink">
              Skapa en skylt till
            </Link>
          )}
        </div>
      </article>
    </div>
  );
}
