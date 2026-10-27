import { canViewAdmin } from "@/features/admin/guard";
import styles from "@/features/admin/admin.module.css";

function isoDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Stockholm" }).format(date);
}

const EXPORTS = [
  {
    type: "invoice",
    title: "Fakturaunderlag",
    body: "En rad per skylt med benämning, artikel, antal och à-pris. Går att importera i Fortnox eller Visma.",
  },
  {
    type: "orders",
    title: "Orderlista",
    body: "En rad per order med kund, status, antal skyltar, belopp och spårningslänk.",
  },
] as const;

export default async function ExportPage() {
  if (!(await canViewAdmin())) return null;
  const now = new Date();
  const monthStart = isoDay(new Date(now.getFullYear(), now.getMonth(), 1));

  return (
    <>
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Export</p>
          <h1 className={styles.pageTitle}>Ladda ner</h1>
          <p className={styles.pageLead}>CSV med svensk formatering — öppnas direkt i Excel och Numbers.</p>
        </div>
      </header>
      <div className={styles.exportGrid}>
        {EXPORTS.map((item) => (
          <form key={item.type} className={`${styles.panel} ${styles.exportCard}`} action="/api/admin/export" method="get">
            <input type="hidden" name="type" value={item.type} />
            <span className={styles.exportIcon} aria-hidden="true">
              <svg viewBox="0 0 20 20" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 2.5h7l3.5 3.5v11.5h-10.5zM12 2.5V6h3.5M7.5 10h5M7.5 13h5" />
              </svg>
            </span>
            <h2 className={styles.sectionTitle}>{item.title}</h2>
            <p className={styles.muted}>{item.body}</p>
            <div className={styles.copyRow}>
              <label className={styles.formRow} style={{ flex: 1 }}>
                <span className={styles.formLabel}>Från</span>
                <input className={styles.input} type="date" name="from" defaultValue={monthStart} />
              </label>
              <label className={styles.formRow} style={{ flex: 1 }}>
                <span className={styles.formLabel}>Till</span>
                <input className={styles.input} type="date" name="to" defaultValue={isoDay(now)} />
              </label>
            </div>
            <button type="submit" className="btn btn--primary">
              Ladda ner {item.title.toLowerCase()}
            </button>
          </form>
        ))}
      </div>
    </>
  );
}
