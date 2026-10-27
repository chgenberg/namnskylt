import styles from "./admin.module.css";

export function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={`${styles.panel} ${styles.notice}`}>
      <p className={styles.eyebrow}>Återförsäljare</p>
      <h1 className={styles.sectionTitle}>{title}</h1>
      <div className={styles.pageLead}>{children}</div>
    </div>
  );
}
