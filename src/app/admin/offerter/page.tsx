import Link from "next/link";
import { BadgePreview } from "@/components/badge-preview";
import { FillDemoButton } from "@/features/admin/demo-data-controls";
import { adminTenant } from "@/features/admin/guard";
import { NoticeList } from "@/features/admin/notice-list";
import { QuoteDecisionButtons } from "@/features/admin/quote-controls";
import { QuoteStatusPill } from "@/features/admin/quote-parts";
import styles from "@/features/admin/admin.module.css";
import { formatDay, formatRelative, formatSek } from "@/lib/format";
import { badgeCount } from "@/lib/orders/model";
import { priceWithPricing } from "@/lib/orders/pricing";
import { displayStatus, type StoredQuote } from "@/lib/quotes/model";
import { listUnreadNotices } from "@/lib/notices/repository";
import { listQuotes } from "@/lib/quotes/repository";
import { isOwner } from "@/lib/tenants/model";

/** Rabatten mot listpris, oavsett om den kommer från à-pris eller procent. */
const savings = (quote: StoredQuote) => priceWithPricing(quote.badges, quote.pricing, quote.priceList, quote.shippingSek).savingsPercent;

export default async function QuotesPage() {
  const tenant = await adminTenant();
  if (!tenant) return null;
  // Offertlistan är återförsäljarens första sida i panelen (besked av ägaren 2026-11-19), så beskeden
  // "Nytt sedan sist" står här för återförsäljaren. Admin har dem på sin översikt.
  const reseller = !isOwner(tenant);
  const [quotes, notices] = await Promise.all([listQuotes(tenant), reseller ? listUnreadNotices(tenant) : []]);
  const now = new Date();
  const open = quotes.filter((q) => ["draft", "sent"].includes(displayStatus(q, now)));
  const openValue = open.reduce((sum, q) => sum + q.totalSek, 0);

  return (
    <>
      {reseller && <NoticeList notices={notices} now={now} />}
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Offerter</p>
          <h1 className={styles.pageTitle}>Offerter</h1>
          <p className={styles.pageLead}>
            {open.length > 0
              ? `${open.length} öppna offerter värda ${formatSek(openValue)} exkl. moms.`
              : "Gör en offert i skyltmotorn och skicka PDF:en till kunden. Godkänn eller neka här när kunden har svarat."}
          </p>
        </div>
        <Link href="/admin/ny-offert" className="btn btn--primary">
          + Skapa offert
        </Link>
      </header>

      {quotes.length === 0 ? (
        <div className={styles.empty}>
          <strong>Inga offerter än</strong>
          <span>
            Skapa offert öppnar skyltmotorn. Gör skylten, tryck på Offert och spara: offerten laddas ner som PDF med en
            3D-film av skylten, och väntar sedan här tills kunden har svarat.
          </span>
          <Link href="/admin/ny-offert" className="btn btn--primary" style={{ marginTop: "var(--space-3)" }}>
            Skapa första offerten
          </Link>
          {reseller && (
            // Det som förut stod på återförsäljarens översikt: loggan först, och demodata för den som vill prova.
            <span>
              Lägg först in er logga under <Link href="/admin/installningar">Inställningar</Link>, så står den på offerten.
              Vill du bara se hur panelen fungerar? <FillDemoButton label="Fyll den med demodata" quiet />
            </span>
          )}
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
                  <h3 className={styles.cardTitle}>{quote.project ?? quote.customer.company ?? quote.customer.name}</h3>
                  <div className={styles.cardMeta}>
                    {quote.project && <span>{quote.customer.company ?? quote.customer.name}</span>}
                    <span>{badgeCount(quote)} st</span>
                    <span>{formatRelative(quote.createdAt, now)}</span>
                    {status === "sent" && <span>gäller t.o.m. {formatDay(quote.validUntil)}</span>}
                    {savings(quote) > 0 && <span className={styles.source}>−{String(savings(quote)).replace(".", ",")} %</span>}
                    {quote.demo && <span className={styles.demoTag}>Demo</span>}
                  </div>
                  <div className={styles.cardFoot}>
                    <span className={styles.amount}>{formatSek(quote.totalSek)}</span>
                    {quote.orderNo && <span className="mono">→ {quote.orderNo}</span>}
                  </div>
                  {/* En offert som väntar på svar besvaras åt kunden direkt i listan (beslut av ägaren 2026-11-19). */}
                  {(status === "sent" || status === "draft") && (
                    <div className={styles.cardDecision}>
                      <QuoteDecisionButtons quoteNo={quote.quoteNo} canCancel={false} />
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
