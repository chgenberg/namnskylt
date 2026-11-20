import Link from "next/link";
import { BadgePreview } from "@/components/badge-preview";
import { DeleteQuoteButton } from "@/features/admin/delete-quote-button";
import { FillDemoButton } from "@/features/admin/demo-data-controls";
import { adminTenant } from "@/features/admin/guard";
import { NoticeList } from "@/features/admin/notice-list";
import { QuoteDecisionButtons } from "@/features/admin/quote-controls";
import { QuoteStatusPill } from "@/features/admin/quote-parts";
import styles from "@/features/admin/admin.module.css";
import { formatDay, formatRelative, formatSek } from "@/lib/format";
import { badgeCount } from "@/lib/orders/model";
import { priceWithPricing } from "@/lib/orders/pricing";
import { displayStatus, quoteCustomerLabel, type StoredQuote } from "@/lib/quotes/model";
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
        <div className={styles.listRows}>
          {quotes.map((quote) => {
            const status = displayStatus(quote, now);
            const first = quote.badges[0];
            const waits = status === "sent" || status === "draft";
            return (
              <article key={quote.id} className={styles.listRow}>
                <Link href={`/admin/offerter/${quote.quoteNo}`} className={styles.listRowLink} aria-label={`Öppna ${quote.quoteNo}`} />
                {/* Skylten längst till vänster, i litet format (besked via ägaren 2026-11-20). */}
                <div className={styles.rowThumb} aria-hidden="true">
                  {first && <BadgePreview doc={first} />}
                </div>
                <div className={styles.rowMain}>
                  <h3 className={styles.rowName}>
                    <span className={styles.orderNo}>{quote.quoteNo}</span>
                    {quote.project ?? quoteCustomerLabel(quote)}
                  </h3>
                  <div className={styles.cardMeta}>
                    {quote.project && <span>{quoteCustomerLabel(quote)}</span>}
                    <span>{badgeCount(quote)} st</span>
                    {quote.badges.length > 1 && <span>{quote.badges.length} namn</span>}
                    <span>{formatRelative(quote.createdAt, now)}</span>
                    {status === "sent" && <span>gäller t.o.m. {formatDay(quote.validUntil)}</span>}
                    {savings(quote) > 0 && <span className={styles.source}>−{String(savings(quote)).replace(".", ",")} %</span>}
                    {quote.orderNo && <span className="mono">→ {quote.orderNo}</span>}
                    {quote.demo && <span className={styles.demoTag}>Demo</span>}
                    {/* Ett utkast utan kund går inte att godkänna än. Hela raden leder till offerten, där kunden väljs. */}
                    {waits && quote.noCustomer && <span data-quote-no-customer>Öppna offerten och välj kund</span>}
                  </div>
                </div>
                <div className={styles.rowTail}>
                  <span className={styles.rowStatus}>
                    <QuoteStatusPill status={status} />
                  </span>
                  <span className={styles.amount}>{formatSek(quote.totalSek)}</span>
                  <div className={styles.rowActions}>
                    {/* En offert som väntar på svar besvaras åt kunden direkt i listan (beslut av ägaren 2026-11-19). */}
                    {waits && !quote.noCustomer && <QuoteDecisionButtons quoteNo={quote.quoteNo} canCancel={false} />}
                    {/* En offert går att ta bort, men inte en som har blivit en order (besked via ägaren 2026-11-20). */}
                    {quote.status !== "accepted" && (
                      <DeleteQuoteButton
                        quoteNo={quote.quoteNo}
                        customerName={quoteCustomerLabel(quote)}
                        badgeCount={badgeCount(quote)}
                        totalSek={quote.totalSek}
                        compact
                      />
                    )}
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
