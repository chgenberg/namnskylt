import { FUNNEL_LABELS, FUNNEL_STAGES, stageRate, type Funnel } from "@/lib/outreach/funnel";
import styles from "./outreach.module.css";

/** Tratten utan interna adresser. Procenten är andelen av steget före. */
export function FunnelKpis({ funnel }: { funnel: Funnel }) {
  return (
    <section className={styles.funnel} aria-label="Tratt">
      {FUNNEL_STAGES.map((stage) => {
        const rate = stageRate(funnel, stage);
        return (
          <div key={stage} className={styles.stage}>
            <span className={styles.controlLabel}>{FUNNEL_LABELS[stage]}</span>
            <span className={styles.stageValue}>{funnel[stage]}</span>
            <span className={styles.stageRate}>{rate === null ? "—" : `${rate} % av steget före`}</span>
          </div>
        );
      })}
    </section>
  );
}
