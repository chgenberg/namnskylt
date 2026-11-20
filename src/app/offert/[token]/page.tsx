import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgePreview } from "@/components/badge-preview";
import { engravedRows, getColor, getMaterial, frameLabel, mountingLabel, printColorLabel, shapeLabel } from "@/engine";
import { formatSek } from "@/lib/format";
import { QuoteDecision, type QuoteShippingOption } from "@/features/quote-public/quote-decision";
import { SellerLogo } from "@/features/quote-public/seller-logo";
import styles from "@/features/quote-public/quote-public.module.css";
import { readableOn } from "@/lib/company/profile";
import { darkPlate, isLightLogo } from "@/lib/images/logo-tone";
import { draftForRecipient, draftFromAddress, shippingMethodOf, shippingNote } from "@/lib/orders/delivery";
import { customerOrderPath, databaseConfigured, getSellerProfile } from "@/lib/orders/repository";
import { shippingFor } from "@/lib/orders/price-lists";
import { priceWithPricing } from "@/lib/orders/pricing";
import { displayStatus, showsElement, showsSellerLogo } from "@/lib/quotes/model";
import { quoteAnswerOf, QUOTE_ANSWER_PARAM } from "@/lib/quotes/quote-email";
import { getQuoteByToken, quotePriceModel } from "@/lib/quotes/repository";
import { quoteShippingMethods, shownShippingOptions } from "@/lib/quotes/shipping";
import {
  QUOTE_PROMISES,
  allBadgesCaption,
  allBadgesMore,
  quoteAllBadges,
  quoteDay,
  quoteGalleries,
  quoteHeading,
  quoteInfoRows,
  quoteSellerLines,
  quoteTermsLines,
  type QuoteGallery,
} from "@/lib/quotes/view";
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
  const saving = priced.savingsSek;
  // Det som står på offerten läses ur samma delar som PDF:en ritas ur, så att sidan och PDF:en säger samma sak.
  const heading = quoteHeading(quote);
  const info = quoteInfoRows(quote, company);
  const galleries = quoteGalleries(quote);
  const beside = galleries.length === 1 ? galleries[0] : undefined;
  const all = quoteAllBadges(quote);
  const closing = quote.options?.closing ?? "";
  const termsLines = quoteTermsLines(quote, company);
  const sellerLines = quoteSellerLines(quote, company);
  const orderPath = status === "accepted" && quote.orderNo ? await customerOrderPath(quote.orderNo) : null;
  // Ska skyltarna till kunden väljer kunden leveranssätt när offerten godkänns. Varje sätt har sin frakt och summa.
  let shippingOptions: QuoteShippingOption[] = [];
  if (status === "sent" && quote.delivery.to === "customer") {
    const model = await quotePriceModel(quote.id);
    const current = shippingMethodOf(quote.delivery);
    const options = quoteShippingMethods(isOwner(quote.resellerId), current).map((method) => {
      const shippingSek = shippingFor(model, quote.badges, method);
      return { method, shippingSek, totalInclVatSek: priceWithPricing(quote.badges, quote.pricing, quote.priceList, shippingSek).totalInclVatSek };
    });
    shippingOptions = shownShippingOptions(options, current);
  }

  const head =
    status === "accepted"
      ? { title: "Tack för ordern!", text: "Skyltarna är på väg till tillverkningen. Du får besked när de skickas." }
      : status === "declined"
        ? { title: "Du tackade nej", text: "Vi har fått beskedet och hör av oss om något kan ändras." }
        : status === "expired"
          ? { title: "Offerten har gått ut", text: `Den gällde till ${quoteDay(quote.validUntil)}. Hör av dig så skickar vi en ny.` }
          : status === "draft"
            ? { title: "Offerten är inte klar än", text: "Du får en länk när den är klar att godkänna." }
            : {
                // Samma rubrik som i PDF:en.
                title: heading.title,
                text: `${heading.eyebrow !== "Offert" ? `${heading.eyebrow} · ` : ""}Giltig till och med ${quoteDay(quote.validUntil)}.`,
              };

  return (
    <main className={styles.page} style={brand}>
      <div className={styles.inner}>
        <SellerLogo company={company} plate={plate} logo={showsSellerLogo(quote)} />
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

        {quote.message && <p className={styles.message}>{quote.message}</p>}

        <section className={styles.card}>
          {/* När sidans rubrik säger hur det gick (godkänd, nekad, utgången) står offertens egen rubrik här. */}
          {status !== "sent" && <h2 className={styles.cardHeading}>{heading.title}</h2>}
          {/* Kundens rader och bilderna, som i PDF:en: en design står bredvid uppgifterna, flera står under. */}
          <div className={styles.overview} data-beside={beside ? "" : undefined}>
            <dl className={styles.info}>
              {info.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
            {beside && <Gallery gallery={beside} />}
          </div>
          {galleries.length > 1 && (
            <div className={styles.designs}>
              {galleries.map((gallery, i) => (
                <Gallery key={i} gallery={gallery} />
              ))}
            </div>
          )}
          {all && (
            <div className={styles.all}>
              <p className={styles.eyebrow}>Alla skyltar</p>
              <div className={styles.allGrid}>
                {all.badges.map((badge, i) => (
                  <figure key={i}>
                    <BadgePreview doc={badge} label={`Skylt: ${allBadgesCaption(badge)}`} />
                    <figcaption>{allBadgesCaption(badge)}</figcaption>
                  </figure>
                ))}
              </div>
              {all.more > 0 && <small className={styles.galleryNote}>{allBadgesMore(all.more)}</small>}
            </div>
          )}
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
                      {frameLabel(badge) && ` · ${frameLabel(badge)}`}
                      {printColorLabel(badge) && ` · ${printColorLabel(badge)}`}
                    </div>
                  </div>
                  <div className={styles.lineAmount}>
                    {line?.overridden && line.unitSek < line.listUnitSek && <s>{formatSek(line.listUnitSek)}/st</s>}
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
            {/* Säljaren kan välja bort momsraderna på offerten, och då står de inte här heller. */}
            {showsElement(quote, "vat") && (
              <>
                <dt>Moms 25 %</dt>
                <dd>{formatSek(priced.vatSek)}</dd>
                <dt>
                  <strong>Att betala inkl. moms</strong>
                </dt>
                <dd>
                  <strong>{formatSek(priced.totalInclVatSek)}</strong>
                </dd>
              </>
            )}
            {saving > 0 && (
              <>
                <dt className={styles.saving}>Du sparar</dt>
                <dd className={styles.saving}>{formatSek(saving)}</dd>
              </>
            )}
          </dl>
          {closing && <p className={styles.closing}>{closing}</p>}
          {showsElement(quote, "promises") && (
            <ul className={styles.promises}>
              {QUOTE_PROMISES.map((promise) => (
                <li key={promise}>{promise}</li>
              ))}
            </ul>
          )}
          {status === "sent" && (
            <QuoteDecision
              token={quote.token}
              totalInclVatSek={priced.totalInclVatSek}
              shippingOptions={shippingOptions}
              shippingMethod={shippingMethodOf(quote.delivery)}
              customerPo={quote.customerPo}
              answer={answer}
              // En offert som kunden laddade ner själv utan att lägga upp sig: uppgifterna fylls i här,
              // förifyllda med det kunden skrev på offerten.
              party={
                quote.noCustomer && quote.byCustomer
                  ? {
                      orgNumber: quote.customer.orgNumber ?? "",
                      company: quote.customer.company ?? "",
                      // Utan namn står företaget som namn på offerten: det är ingen kontaktperson.
                      name: quote.customer.name !== (quote.customer.company ?? "") ? quote.customer.name : "",
                      email: quote.customer.email,
                    }
                  : null
              }
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
          {sellerLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {termsLines.length > 0 && <p className={styles.terms}>{termsLines.join("\n")}</p>}
        </div>
      </div>
    </main>
  );
}

/** En design som den visas överst på offerten: den stora bilden, vinklarna under och raden om vilka skyltar den gäller. */
function Gallery({ gallery }: { gallery: QuoteGallery }) {
  return (
    <div className={styles.gallery}>
      <div className={styles.shot}>
        {gallery.main ? (
          // eslint-disable-next-line @next/next/no-img-element -- data-URL från skyltmotorn
          <img src={gallery.main} alt="Skylten i 3D" />
        ) : (
          <BadgePreview doc={gallery.doc} label="Skylten" />
        )}
      </div>
      {gallery.angles.length > 0 && (
        <div className={styles.angles}>
          {gallery.angles.map((angle) => (
            <figure key={angle.label}>
              {/* eslint-disable-next-line @next/next/no-img-element -- data-URL från skyltmotorn */}
              <img src={angle.src} alt={`Skylten ${angle.label.toLowerCase()}`} />
              <figcaption>{angle.label}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {gallery.note && <small className={styles.galleryNote}>{gallery.note}</small>}
    </div>
  );
}
