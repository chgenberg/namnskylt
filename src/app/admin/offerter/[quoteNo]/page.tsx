import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgePreview } from "@/components/badge-preview";
import { adminTenant } from "@/features/admin/guard";
import { PricingEditor } from "@/features/admin/pricing-editor";
import { updateQuotePricingAction } from "@/features/admin/quote-actions";
import { QuoteDecisionButtons, QuoteSendPanel, QuoteTermsForm } from "@/features/admin/quote-controls";
import { QuoteFlow, QuoteStatusPill } from "@/features/admin/quote-parts";
import styles from "@/features/admin/admin.module.css";
import { formatDate, formatDay, formatSek } from "@/features/orders/format";
import { siteOrigin } from "@/lib/http/origin";
import { badgeCount } from "@/lib/orders/model";
import { getPurchaseTerms } from "@/lib/orders/repository";
import { canEditQuote, displayStatus } from "@/lib/quotes/model";
import { getQuote } from "@/lib/quotes/repository";

interface QuotePageProps {
  params: Promise<{ quoteNo: string }>;
}

export default async function QuotePage({ params }: QuotePageProps) {
  const tenant = await adminTenant();
  if (!tenant) return null;
  const { quoteNo } = await params;
  const quote = await getQuote(tenant, decodeURIComponent(quoteNo));
  if (!quote) notFound();
  const status = displayStatus(quote);
  const editable = canEditQuote(quote);
  const [origin, purchase] = await Promise.all([siteOrigin(), getPurchaseTerms(tenant)]);
  const link = quote.status === "sent" || status === "expired" ? `${origin}/offert/${quote.token}` : null;
  const name = quote.customer.company ?? quote.customer.name;

  return (
    <>
      <header className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>
            <Link href="/admin/offerter" className={styles.link}>
              Offerter
            </Link>{" "}
            / <span className="mono">{quote.quoteNo}</span>
            {quote.project && <> · {name}</>}
            {quote.demo && <span className={styles.demoTag}> Demo</span>}
          </p>
          <h1 className={styles.pageTitle}>{quote.project ?? name}</h1>
          <p className={styles.pageLead}>
            <QuoteStatusPill status={status} /> &nbsp;{badgeCount(quote)} skyltar · {formatSek(quote.totalSek)} exkl. moms · skapad{" "}
            {formatDate(quote.createdAt)}
          </p>
        </div>
        <div className={styles.actionBar}>
          <a href={`/offert/${quote.token}/pdf`} className={styles.ghostButton}>
            ↓ PDF
          </a>
          <a href={`/offert/${quote.token}`} target="_blank" rel="noreferrer" className={styles.ghostButton}>
            Förhandsgranska
          </a>
        </div>
      </header>

      <QuoteFlow status={status} />

      <div className={styles.detail}>
        <div className={styles.detailSide}>
          <section className={styles.panel}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Skyltar</h2>
              <span className={styles.muted}>
                {quote.badges.length} namn · {badgeCount(quote)} st
              </span>
            </div>
            {quote.badgeShot && (
              <div className={styles.shotHero}>
                {/* eslint-disable-next-line @next/next/no-img-element -- data-URL från skyltmotorn */}
                <img src={quote.badgeShot} alt="Skylten i 3D" />
              </div>
            )}
            <div className={styles.badgeGrid}>
              {quote.badges.map((badge, i) => (
                <figure key={i} className={styles.badgeTile}>
                  <BadgePreview doc={badge} />
                  <figcaption className={styles.badgeTileMeta}>
                    <span>
                      {badge.quantity} st · {badge.size.widthMm}×{badge.size.heightMm}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Pris</h2>
              <span className={styles.muted}>{editable ? "Ändra à-pris per skylt eller ge rabatt" : "Låst — offerten är besvarad"}</span>
            </div>
            <PricingEditor
              purchase={purchase}
              badges={quote.badges}
              pricing={quote.pricing}
              submit={editable ? updateQuotePricingAction.bind(null, quote.quoteNo) : undefined}
            />
          </section>

          <section className={styles.panel}>
            <h2 className={styles.sectionTitle} style={{ marginBottom: "var(--space-3)" }}>
              Villkor och hälsning
            </h2>
            <QuoteTermsForm quoteNo={quote.quoteNo} project={quote.project} message={quote.message} validUntil={quote.validUntil} editable={editable} />
          </section>
        </div>

        <div className={styles.detailSide}>
          <section className={styles.panel}>
            <h2 className={styles.sectionTitle} style={{ marginBottom: "var(--space-3)" }}>
              {quote.status === "accepted" ? "Godkänd" : "Skicka till kunden"}
            </h2>
            {quote.status === "accepted" ? (
              <div className={styles.callout} data-tone="good">
                <strong>Offerten är godkänd och har blivit en order.</strong>
                {quote.decidedAt && <span>{formatDate(quote.decidedAt)}</span>}
                {quote.orderNo && (
                  <Link href={`/admin/ordrar/${quote.orderNo}`} className={styles.link}>
                    Öppna order {quote.orderNo} →
                  </Link>
                )}
              </div>
            ) : quote.status === "cancelled" ? (
              <div className={styles.callout}>Offerten är makulerad och kundens länk gäller inte längre.</div>
            ) : (
              <>
                {quote.status === "declined" && (
                  <div className={styles.callout} data-tone="warn" style={{ marginBottom: "var(--space-3)" }}>
                    <strong>Kunden tackade nej{quote.decidedAt ? ` ${formatDate(quote.decidedAt)}` : ""}.</strong>
                    {quote.declineReason && <span>”{quote.declineReason}”</span>}
                    <span>Justera pris eller villkor och skicka igen.</span>
                  </div>
                )}
                {status === "expired" && (
                  <div className={styles.callout} data-tone="warn" style={{ marginBottom: "var(--space-3)" }}>
                    Offerten gick ut {formatDay(quote.validUntil)}. Förläng giltigheten och skicka igen.
                  </div>
                )}
                <QuoteSendPanel
                  quoteNo={quote.quoteNo}
                  customerName={quote.customer.name.split(" ")[0] ?? quote.customer.name}
                  email={quote.customer.email}
                  totalSek={quote.totalSek}
                  link={link}
                  sent={quote.status === "sent"}
                />
              </>
            )}
          </section>

          {editable && (
            <section className={styles.panel}>
              <h2 className={styles.sectionTitle} style={{ marginBottom: "var(--space-3)" }}>
                Kunden har sagt ja?
              </h2>
              <QuoteDecisionButtons quoteNo={quote.quoteNo} canCancel />
            </section>
          )}

          <section className={styles.panel}>
            <h2 className={styles.sectionTitle} style={{ marginBottom: "var(--space-3)" }}>
              Kund
            </h2>
            <dl className={styles.facts}>
              <dt>Kontakt</dt>
              <dd>
                <Link href={`/admin/kunder/${quote.customer.id}`} className={styles.link}>
                  {quote.customer.name}
                </Link>
              </dd>
              <dt>E-post</dt>
              <dd>{quote.customer.email}</dd>
              {quote.customer.phone && (
                <>
                  <dt>Telefon</dt>
                  <dd>{quote.customer.phone}</dd>
                </>
              )}
              {quote.customer.orgNumber && (
                <>
                  <dt>Org.nr</dt>
                  <dd>{quote.customer.orgNumber}</dd>
                </>
              )}
              {quote.customer.address && (
                <>
                  <dt>Adress</dt>
                  <dd style={{ whiteSpace: "pre-line" }}>{quote.customer.address}</dd>
                </>
              )}
            </dl>
          </section>

          <section className={styles.panel}>
            <h2 className={styles.sectionTitle} style={{ marginBottom: "var(--space-3)" }}>
              Händelser
            </h2>
            <ul className={styles.eventList}>
              {[...quote.events].reverse().map((event, i) => (
                <li key={i}>
                  <strong>{event.note ?? event.status}</strong>
                  <span className={styles.muted}>{formatDate(event.at)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
