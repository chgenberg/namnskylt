import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgePreview } from "@/components/badge-preview";
import { engravedRows, getColor, getMaterial, mountingLabel, printColorLabel, shapeLabel } from "@/engine";
import { formatDay, formatSek } from "@/lib/format";
import { QuoteDecision, type QuoteShippingOption } from "@/features/quote-public/quote-decision";
import { SellerLogo } from "@/features/quote-public/seller-logo";
import styles from "@/features/quote-public/quote-public.module.css";
import { companyFooter, readableOn } from "@/lib/company/profile";
import { darkPlate, isLightLogo } from "@/lib/images/logo-tone";
import { deliveryLines, draftForRecipient, draftFromAddress, shippingMethodOf, shippingNote } from "@/lib/orders/delivery";
import { customerOrderPath, databaseConfigured, getSellerProfile } from "@/lib/orders/repository";
import { shippingFor } from "@/lib/orders/price-lists";
import { priceWithPricing } from "@/lib/orders/pricing";
import { displayStatus } from "@/lib/quotes/model";
import { quoteAnswerOf, QUOTE_ANSWER_PARAM } from "@/lib/quotes/quote-email";
import { getQuoteByToken, quotePriceModel } from "@/lib/quotes/repository";
import { quoteShippingMethods } from "@/lib/quotes/shipping";
import { isOwner } from "@/lib/tenants/model";

export const metadata: Metadata = {
  title: "Offert",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

interface QuotePublicPageProps {
  params: Promise<{ token: string }>;
  /** `svar` är valet mottagaren gjorde i offertmejlet. Det är bara förvalt: ett klick på sidan bekräftar. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function QuotePublicPage({ params, searchParams }: QuotePublicPageProps) {
  if (!databaseConfigured()) notFound();
  const { token } = await params;
  const answer = quoteAnswerOf((await searchParams)[QUOTE_ANSWER_PARAM]);
  const quote = await getQuoteByToken(token);
  if (!quote || quote.status === "cancelled") notFound();
  // Säljaren som kunden möter: Skylt & Gravyrteknik hos namnskylt.com, annars återförsäljaren.
  const company = await getSellerProfile(quote.resellerId);
  const plate = (await isLightLogo(company.logo)) ? darkPlate(company.primaryColor) : null;
  const brand = {
    "--brand": company.primaryColor,
    "--brand-on": readableOn(company.primaryColor),
    "--brand-accent": company.accentColor,
  } as React.CSSProperties;
  const status = displayStatus(quote);
  const priced = priceWithPricing(quote.badges, quote.pricing, quote.priceList, quote.shippingSek);
  const shipping = shippingNote(shippingMethodOf(quote.delivery));
  const firstName = quote.customer.name.split(" ")[0] ?? quote.customer.name;
  const saving = priced.savingsSek;
  const orderPath = status === "accepted" && quote.orderNo ? await customerOrderPath(quote.orderNo) : null;
  // Ska skyltarna till kunden väljer kunden leveranssätt när offerten godkänns. Varje sätt har sin frakt och summa.
  let shippingOptions: QuoteShippingOption[] = [];
  if (status === "sent" && quote.delivery.to === "customer") {
    const model = await quotePriceModel(quote.id);
    shippingOptions = quoteShippingMethods(isOwner(quote.resellerId), shippingMethodOf(quote.delivery)).map((method) => {
      const shippingSek = shippingFor(model, quote.badges, method);
      return { method, shippingSek, totalInclVatSek: priceWithPricing(quote.badges, quote.pricing, quote.priceList, shippingSek).totalInclVatSek };
    });
  }

  const head =
    status === "accepted"
      ? { title: "Tack för ordern!", text: "Skyltarna är på väg till tillverkningen. Du får besked när de skickas." }
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
        <SellerLogo company={company} plate={plate} />
        <header className={styles.head}>
          <p className={styles.eyebrow}>
            Offert · <span className="mono">{quote.quoteNo}</span>
          </p>
          <h1 className={styles.title}>{head.title}</h1>
          <p className={styles.lead}>{head.text}</p>
          {orderPath && (
            <p className={styles.lead}>
              <a href={orderPath} className={styles.pdf}>
                Följ din order
              </a>
            </p>
          )}
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
                      {shapeLabel(badge)} {badge.size.widthMm}×{badge.size.heightMm} mm ·{" "}
                      {mountingLabel(badge)}
                      {printColorLabel(badge) && ` · ${printColorLabel(badge)}`}
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
            {priced.minimumTopUpSek > 0 && (
              <>
                <dt>Upp till minsta ordervärde</dt>
                <dd>{formatSek(priced.minimumTopUpSek)}</dd>
              </>
            )}
            {priced.shippingSek > 0 && (
              <>
                <dt>Frakt</dt>
                <dd>{formatSek(priced.shippingSek)}</dd>
              </>
            )}
            {shipping && (
              <>
                <dt>{shipping.label}</dt>
                <dd>{shipping.value}</dd>
              </>
            )}
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
          {quote.delivery.address && (status === "accepted" || quote.delivery.to === "reseller") && (
            <p className={styles.deliveryNote}>
              <strong>{quote.delivery.to === "reseller" ? `Skyltarna skickas till ${company.name}` : "Skyltarna skickas till"}</strong>
              {quote.delivery.to === "customer" &&
                deliveryLines(quote.delivery.address).map((line) => (
                  <span key={line}>{line}</span>
                ))}
            </p>
          )}
          {status === "sent" && (
            <QuoteDecision
              token={quote.token}
              totalInclVatSek={priced.totalInclVatSek}
              shippingOptions={shippingOptions}
              shippingMethod={shippingMethodOf(quote.delivery)}
              answer={answer}
              deliveryDraft={
                quote.delivery.to === "customer"
                  ? quote.delivery.address
                    ? draftFromAddress(quote.delivery.address)
                    : draftForRecipient(quote.customer)
                  : null
              }
            />
          )}
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
