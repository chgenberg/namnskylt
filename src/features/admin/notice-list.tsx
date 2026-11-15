import Link from "next/link";
import { formatRelative } from "@/lib/format";
import { noticeView, type NoticeTone, type PanelNotice } from "@/lib/notices/model";
import { MarkAllReadButton } from "./mark-all-read-button";
import styles from "./admin.module.css";

const ICON: Record<NoticeTone, string> = { good: "✓", warn: "!", info: "•" };

/** Olästa besked överst på översikten: vad kunderna har gjort sedan sist. Visas inte när inget är nytt. */
export function NoticeList({ notices, now }: { notices: PanelNotice[]; now: Date }) {
  if (notices.length === 0) return null;
  return (
    <section className={`${styles.panel} ${styles.noticePanel}`} aria-labelledby="notices">
      <div className={styles.sectionHead}>
        <h2 id="notices" className={styles.sectionTitle}>
          Nytt sedan sist
        </h2>
        <MarkAllReadButton />
      </div>
      <ul className={styles.attention} role="list">
        {notices.map((notice) => {
          const view = noticeView(notice);
          return (
            <li key={notice.id}>
              <Link href={view.href} className={styles.attentionItem} data-tone={view.tone}>
                <span className={styles.attentionIcon} aria-hidden="true">
                  {ICON[view.tone]}
                </span>
                <span>
                  <strong>{view.title}</strong>
                  {view.detail && <span className={styles.noticeDetail}>{view.detail}</span>}
                </span>
                <span className={styles.muted}>{formatRelative(notice.createdAt, now)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
