import Link from "next/link";
import { BadgePreview } from "@/components/badge-preview";
import { canViewAdmin } from "@/features/admin/guard";
import { QuoteStatusPill } from "@/features/admin/quote-parts";
import styles from "@/features/admin/admin.module.css";
import { formatDay, formatRelative, formatSek } from "@/features/orders/format";
import { badgeCount } from "@/lib/orders/model";
import { displayStatus } from "@/lib/quotes/model";
import { listQuotes } from "@/lib/quotes/repository";

export default async function QuotesPage() {
  if (!(await canViewAdmin())) return null;
  const quotes = await listQuotes();
  const now = new Date();
  const open = quotes.filter((q) => ["draft", "sent"].includes(displayStatus(q, now)));
  const openValue = open.reduce((sum, q) => sum + q.totalSek, 0);

  return (
    <>
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Offerter</p>
          <h1 className={styles.pageTitle}>Offerter</h1>
          <p className={styles.pageLead}>
            {open.length > 0
              ? `${open.length} öppna offerter värda ${formatSek(openValue)} exkl. moms.`
              : "Gör en offert i skyltmotorn — kunden godkänner med ett klick och offerten blir en order."}
          </p>
        </div>
        <Link href="/admin/ny-offert" className="btn btn--primary">
          + Skapa offert
        </Link>
      </header>

      {quotes.length === 0 ? (
        <div className={styles.empty}>
          <strong>Inga offerter än</strong>
          <span>Fyll i kundens uppgifter, designa skyltarna och skicka en snygg offert med länk och PDF.</span>
          <Link href="/admin/ny-offert" className="btn btn--primary" style={{ marginTop: "var(--space-3)" }}>
            Skapa första offerten
          </Link>
        </div>
      ) : (
        <div className={styles.cards}>
          {quotes.map((quote) => {
            const status = displayStatus(quote, now);
            return (
              <article key={quote.id} className={styles.orderCard}>
                <Link href={`/admin/offerter/${quote.quoteNo}`} className={styles.orderCardLink} aria-label={`Öppna ${quote.quoteNo}`} />
                <div className={styles.stage} aria-hidden="true">
                  <div className={styles.stageStack}>
                    {quote.badges.slice(0, 3).map((badge, i) => (
                      <BadgePreview key={i} doc={badge} className={styles.stageBadge} />
                    ))}
                  </div>
                  {quote.badges.length > 1 && <span className={styles.stageCount}>{quote.badges.length} namn</span>}
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.cardTop}>
                    <span className={styles.orderNo}>{quote.quoteNo}</span>
                    <QuoteStatusPill status={status} />
                  </div>
                  <h3 className={styles.cardTitle}>{quote.customer.company ?? quote.customer.name}</h3>
                  <div className={styles.cardMeta}>
                    <span>{badgeCount(quote)} st</span>
                    <span>{formatRelative(quote.createdAt, now)}</span>
                    {status === "sent" && <span>gäller t.o.m. {formatDay(quote.validUntil)}</span>}
                    {quote.pricing?.discountPercent ? <span className={styles.source}>−{quote.pricing.discountPercent} %</span> : null}
                    {quote.demo && <span className={styles.demoTag}>Demo</span>}
                  </div>
                  <div className={styles.cardFoot}>
                    <span className={styles.amount}>{formatSek(quote.totalSek)}</span>
                    {quote.orderNo && <span className="mono">→ {quote.orderNo}</span>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
