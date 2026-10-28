import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { BadgePreview } from "@/components/badge-preview";
import { engravedRows, getColor, getMaterial, getMounting, SHAPES } from "@/engine";
import { formatDay, formatSek } from "@/features/orders/format";
import { QuoteDecision } from "@/features/quote-public/quote-decision";
import styles from "@/features/quote-public/quote-public.module.css";
import { companyFooter, readableOn } from "@/lib/company/profile";
import { darkPlate, isLightLogo } from "@/lib/images/logo-tone";
import { databaseConfigured, getCompanyProfile } from "@/lib/orders/repository";
import { priceWithPricing } from "@/lib/orders/pricing";
import { displayStatus } from "@/lib/quotes/model";
import { getQuoteByToken } from "@/lib/quotes/repository";

export const metadata: Metadata = {
  title: "Offert",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

interface QuotePublicPageProps {
  params: Promise<{ token: string }>;
}

export default async function QuotePublicPage({ params }: QuotePublicPageProps) {
  if (!databaseConfigured()) notFound();
  const { token } = await params;
  const quote = await getQuoteByToken(token);
  if (!quote || quote.status === "cancelled") notFound();
  const company = await getCompanyProfile(quote.resellerId);
  const plate = (await isLightLogo(company.logo)) ? darkPlate(company.primaryColor) : null;
  const brand = {
    "--brand": company.primaryColor,
    "--brand-on": readableOn(company.primaryColor),
    "--brand-accent": company.accentColor,
  } as React.CSSProperties;
  const status = displayStatus(quote);
  const priced = priceWithPricing(quote.badges, quote.pricing);
  const firstName = quote.customer.name.split(" ")[0] ?? quote.customer.name;
  const saving = priced.savingsSek;

  const head =
    status === "accepted"
      ? { title: "Tack för ordern!", text: "Skyltarna är på väg till gravyren. Du får besked när de skickas." }
      : status === "declined"
        ? { title: "Du tackade nej", text: "Vi har fått beskedet och hör av oss om något kan ändras." }
        : status === "expired"
          ? { title: "Offerten har gått ut", text: `Den gällde till ${formatDay(quote.validUntil)}. Hör av dig så skickar vi en ny.` }
          : status === "draft"
            ? { title: "Offerten är inte klar än", text: "Du får en länk när den är klar att godkänna." }
            : {
                title: quote.project ?? `Offert till ${quote.customer.company ?? firstName}`,
                text: `${quote.project ? `Till ${quote.customer.company ?? quote.customer.name} · ` : ""}Giltig till och med ${formatDay(quote.validUntil)}.`,
              };

  return (
    <main className={styles.page} style={brand}>
      <div className={styles.inner}>
        {company.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- data-URL ur inställningarna
          <img
            src={company.logo}
            alt={company.name}
            className={styles.logo}
            style={plate ? { background: plate, padding: "6px 12px", borderRadius: 10 } : undefined}
          />
        ) : company.name === "namnskylt.com" ? (
          <Image src="/logo-namnskylt.png" alt="namnskylt.com" width={1024} height={328} className={styles.logo} priority />
        ) : (
          <p className={styles.brandName}>{company.name}</p>
        )}
        <header className={styles.head}>
          <p className={styles.eyebrow}>
            Offert · <span className="mono">{quote.quoteNo}</span>
          </p>
          <h1 className={styles.title}>{head.title}</h1>
          <p className={styles.lead}>{head.text}</p>
        </header>

        {quote.message && status === "sent" && <p className={styles.message}>{quote.message}</p>}

        <section className={styles.card}>
          {quote.badgeShot && (
            <div className={styles.shot}>
              {/* eslint-disable-next-line @next/next/no-img-element -- data-URL från skyltmotorn */}
              <img src={quote.badgeShot} alt="Skylten i 3D" />
            </div>
          )}
          <div className={styles.meta}>
            <span>
              <strong>{quote.customer.company ?? quote.customer.name}</strong>
            </span>
            <span>{quote.customer.name}</span>
            <span>{quote.customer.email}</span>
          </div>
          <ul className={styles.lines}>
            {quote.badges.map((badge, i) => {
              const line = priced.lines[i];
              const text = engravedRows(badge)
                .map((r) => r.text.trim())
                .filter(Boolean)
                .join(", ");
              return (
                <li key={i} className={styles.line}>
                  <BadgePreview doc={badge} className={styles.lineBadge} label={`Skylt: ${text}`} />
                  <div>
                    <div className={styles.lineName}>{text || "Utan text"}</div>
                    <div className={styles.lineSpec}>
                      {getMaterial(badge.materialId).name} · {getColor(badge.materialId, badge.colorId).name} ·{" "}
                      {SHAPES.find((s) => s.id === badge.shape)?.name} {badge.size.widthMm}×{badge.size.heightMm} mm ·{" "}
                      {getMounting(badge.mounting).name}
                    </div>
                  </div>
                  <div className={styles.lineAmount}>
                    {line?.overridden && <s>{formatSek(line.listUnitSek)}/st</s>}
                    {line?.quantity} st × {formatSek(line?.unitSek ?? 0)}
                    <div>
                      <strong>{formatSek(line?.totalSek ?? 0)}</strong>
                    </div>
                  </div>
                </li>
              );
            })}
            {priced.extras.map((extra, i) => (
              <li key={`extra-${i}`} className={styles.line}>
                <span className={styles.lineBadge} aria-hidden="true" />
                <div>
                  <div className={styles.lineName}>{extra.label}</div>
                </div>
                <div className={styles.lineAmount}>
                  <strong>{formatSek(extra.amountSek)}</strong>
                </div>
              </li>
            ))}
          </ul>
          <dl className={styles.totals}>
            {priced.savingsSek > 0 && (
              <>
                <dt>Skyltar till listpris</dt>
                <dd>{formatSek(priced.listTotalSek)}</dd>
                <dt className={styles.saving}>Rabatt {String(priced.savingsPercent).replace(".", ",")} %</dt>
                <dd className={styles.saving}>−{formatSek(priced.savingsSek)}</dd>
              </>
            )}
            <dt>Skyltar</dt>
            <dd>{formatSek(priced.badgesSek)}</dd>
            {priced.extras.map((extra, i) => (
              <span key={i} style={{ display: "contents" }}>
                <dt>{extra.label}</dt>
                <dd>{formatSek(extra.amountSek)}</dd>
              </span>
            ))}
            <dt className={styles.grand}>Totalt exkl. moms</dt>
            <dd className={styles.grand}>{formatSek(priced.totalSek)}</dd>
            <dt>Moms 25 %</dt>
            <dd>{formatSek(priced.vatSek)}</dd>
            <dt>
              <strong>Att betala</strong>
            </dt>
            <dd>
              <strong>{formatSek(priced.totalInclVatSek)}</strong>
            </dd>
            {saving > 0 && (
              <>
                <dt className={styles.saving}>Du sparar</dt>
                <dd className={styles.saving}>{formatSek(saving)}</dd>
              </>
            )}
          </dl>
          {status === "sent" && <QuoteDecision token={quote.token} totalInclVatSek={priced.totalInclVatSek} />}
        </section>

        <a href={`/offert/${quote.token}/pdf`} className={styles.pdf}>
          Ladda ner offerten som PDF
        </a>
        <div className={styles.foot}>
          {companyFooter(company).map((line) => (
            <p key={line}>{line}</p>
          ))}
          {company.quoteTerms && <p className={styles.terms}>{company.quoteTerms}</p>}
        </div>
      </div>
    </main>
  );
}
