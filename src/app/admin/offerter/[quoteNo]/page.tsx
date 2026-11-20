import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgePreview } from "@/components/badge-preview";
import { DeleteQuoteButton } from "@/features/admin/delete-quote-button";
import { DeliveryPanel } from "@/features/admin/delivery-panel";
import { LogoOriginalLinks } from "@/features/admin/logo-original-links";
import { adminTenant } from "@/features/admin/guard";
import { NoticesSeen } from "@/features/admin/notices-seen";
import { PricingEditor } from "@/features/admin/pricing-editor";
import { updateQuotePricingAction } from "@/features/admin/quote-actions";
import { QuoteDecisionButtons, QuoteSendPanel, QuoteTermsForm } from "@/features/admin/quote-controls";
import { QuoteCustomerForm } from "@/features/admin/quote-customer-form";
import { QuoteFlow, QuoteStatusPill } from "@/features/admin/quote-parts";
import styles from "@/features/admin/admin.module.css";
import { formatDate, formatDay, formatSek, plural } from "@/lib/format";
import { siteOrigin } from "@/lib/http/origin";
import { countUnreadNotices } from "@/lib/notices/repository";
import { customerChoiceRows } from "@/lib/orders/customer-choices";
import { deliveryOptions } from "@/lib/orders/delivery-options";
import { badgeCount } from "@/lib/orders/model";
import { canEditQuote, displayStatus, quoteCustomerLabel } from "@/lib/quotes/model";
import { getQuote } from "@/lib/quotes/repository";
import { quoteEmailOn } from "@/lib/quotes/send";
import { isOwner } from "@/lib/tenants/model";

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
  const [origin, addresses, unread] = await Promise.all([
    siteOrigin(),
    deliveryOptions(tenant, quote.customer),
    countUnreadNotices(tenant, { quoteNo: quote.quoteNo }),
  ]);
  const link = quote.status === "sent" || status === "expired" ? `${origin}/offert/${quote.token}` : null;
  const name = quoteCustomerLabel(quote);
  // Ett utkast som sparades utan kund i skyltmotorn får sin kund här, innan det går att skicka eller godkänna.
  const needsCustomer = Boolean(quote.noCustomer) && editable;
  const customers = needsCustomer ? await customerChoiceRows(tenant) : [];

  return (
    <>
      {unread > 0 && <NoticesSeen target={{ quoteNo: quote.quoteNo }} />}
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
            <QuoteStatusPill status={status} /> &nbsp;{plural(badgeCount(quote), "skylt", "skyltar")} · {formatSek(quote.totalSek)} exkl. moms · skapad{" "}
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
          {/* En offert som har blivit en order är orderns underlag och går inte att ta bort. */}
          {quote.status !== "accepted" && (
            <DeleteQuoteButton
              quoteNo={quote.quoteNo}
              customerName={name}
              badgeCount={badgeCount(quote)}
              totalSek={quote.totalSek}
              redirectTo="/admin/offerter"
            />
          )}
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
            <LogoOriginalLinks badges={quote.badges} />
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Pris</h2>
              <span className={styles.muted}>{editable ? "Ändra à-pris per skylt eller ge rabatt" : "Låst — offerten är besvarad"}</span>
            </div>
            <PricingEditor
              priceList={quote.priceList}
              purchaseList={quote.purchaseList}
              shippingSek={quote.shippingSek}
              badges={quote.badges}
              pricing={quote.pricing}
              submit={editable ? updateQuotePricingAction.bind(null, quote.quoteNo) : undefined}
            />
          </section>

          <section className={styles.panel}>
            <h2 className={styles.sectionTitle} style={{ marginBottom: "var(--space-3)" }}>
              Leverans
            </h2>
            <DeliveryPanel
              target={{ kind: "quote", quoteNo: quote.quoteNo }}
              delivery={quote.delivery}
              options={addresses}
              locked={editable ? null : "Låst — offerten är besvarad."}
            />
          </section>

          <section className={styles.panel}>
            <h2 className={styles.sectionTitle} style={{ marginBottom: "var(--space-3)" }}>
              Villkor och hälsning
            </h2>
            <QuoteTermsForm
              quoteNo={quote.quoteNo}
              project={quote.project}
              message={quote.message}
              validUntil={quote.validUntil}
              customerPo={quote.customerPo ?? null}
              editable={editable}
            />
          </section>
        </div>

        <div className={styles.detailSide}>
          {needsCustomer && (
            <section className={styles.panel} data-quote-needs-customer>
              <h2 className={styles.sectionTitle} style={{ marginBottom: "var(--space-3)" }}>
                Välj kund
              </h2>
              <div className={styles.callout} data-tone="warn" style={{ marginBottom: "var(--space-3)" }}>
                <strong>Utkast utan kund</strong>
                <span>
                  PDF:en går att ladda ner och skicka som den är. Välj kund här, så går offerten att skicka och godkänna.
                </span>
              </div>
              <QuoteCustomerForm quoteNo={quote.quoteNo} customers={customers} needsInvoiceDetails={isOwner(tenant)} />
            </section>
          )}

          {!needsCustomer && (
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
                  // En demooffert mejlas aldrig.
                  emailOn={quoteEmailOn() && !quote.demo}
                  // Efter ett nej eller en ändring tillbaka till utkast gäller inte mejlets knappar längre.
                  emailedAt={status === "sent" ? quote.emailedAt : null}
                />
              </>
            )}
          </section>
          )}

          {editable && (
            <section className={styles.panel}>
              <h2 className={styles.sectionTitle} style={{ marginBottom: "var(--space-3)" }}>
                Kundens svar
              </h2>
              <p className={styles.hint} style={{ marginBottom: "var(--space-3)" }}>
                {needsCustomer
                  ? "Välj kund först. Sedan går offerten att godkänna, och blir då en order som går till tillverkningen."
                  : "Godkänn när kunden har sagt ja: då blir offerten en order som går till tillverkningen. Neka om kunden tackar nej."}
              </p>
              <QuoteDecisionButtons quoteNo={quote.quoteNo} canCancel needsCustomer={needsCustomer} />
            </section>
          )}

          {!quote.noCustomer && (
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
          )}

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
