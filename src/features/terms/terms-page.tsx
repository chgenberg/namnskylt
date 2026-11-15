import Link from "next/link";
import styles from "./terms.module.css";

/** Säljaren som villkoren gäller: namnskylt.com på vår egen sajt, återförsäljaren i en butik. */
export interface TermsSeller {
  name: string;
  orgNumber: string;
  address: string;
  email: string;
}

interface TermsPageProps {
  seller: TermsSeller;
  /** Butikens namn när villkoren visas i en återförsäljares butik. Där säljs bara till företag, på faktura. */
  shopName?: string;
  /** Privatpersoner kan betala med kort. Bara på namnskylt.com, och bara när kortbetalningen är påslagen. */
  cardPayments?: boolean;
}

/** Fakturans betalningstid på namnskylt.com, samma som hos Skylt & Gravyrteknik. */
const INVOICE_DAYS = 30;
/** Dagen villkoren senast ändrades. */
const UPDATED = "2026-11-15";

/**
 * Köpvillkoren. Texten utgår från Skylt & Gravyrtekniks egna villkor och från
 * det sajten redan lovar: korrektur innan produktion och leverans inom fem
 * arbetsdagar. Säljarens uppgifter kommer ur företagsuppgifterna i panelen.
 */
export function TermsPage({ seller, shopName, cardPayments = false }: TermsPageProps) {
  const shop = Boolean(shopName);
  const address = seller.address.split("\n").map((line) => line.trim()).filter(Boolean).join(", ");
  const sellerLine = [seller.name, seller.orgNumber && `org.nr ${seller.orgNumber}`, address].filter(Boolean).join(", ");
  return (
    <article className={styles.page}>
      <p className={styles.eyebrow}>Villkor</p>
      <h1 className={styles.title}>Köpvillkor</h1>
      <p className={styles.lead}>
        Villkoren gäller när du beställer namnskyltar {shop ? `hos ${shopName}` : "på namnskylt.com"}.
      </p>

      <section className={styles.section}>
        <h2>Säljare</h2>
        <p>
          {sellerLine}.{" "}
          {seller.email && (
            <>
              Du når oss på <a href={`mailto:${seller.email}`}>{seller.email}</a>.
            </>
          )}
        </p>
        <p>{shop ? "Skyltarna tillverkas i Sverige." : "Skyltarna tillverkas i Sverige av Skylt & Gravyrteknik."}</p>
      </section>

      <section className={styles.section}>
        <h2>Beställning och pris</h2>
        <p>
          Priserna anges i svenska kronor. Priset per skylt beror på material, fäste, tillval och hur många skyltar du
          beställer, och det visas innan du beställer. Moms på 25 % och frakt tillkommer och visas i kassan.
        </p>
        <p>Avtalet gäller när din beställning är mottagen och du har fått ett ordernummer.</p>
      </section>

      <section className={styles.section}>
        <h2>Betalning</h2>
        {shop ? (
          <p>
            Vi säljer till företag och verksamheter. Ordern betalas mot faktura från {seller.name}, och betalningstiden
            står på fakturan.
          </p>
        ) : (
          <>
            <p>
              Företag och verksamheter betalar mot faktura med {INVOICE_DAYS} dagars betalningstid. Fakturan skickas när
              ordern har levererats, och beställningen kräver ett organisationsnummer.
            </p>
            {cardPayments && (
              <p>Privatpersoner betalar med kort när beställningen läggs. Ordern registreras när betalningen är klar.</p>
            )}
          </>
        )}
      </section>

      <section className={styles.section}>
        <h2>Korrektur</h2>
        <p>
          Du ser skylten som den kommer att tillverkas innan du beställer. Korrektur innan produktion ingår. Det du
          godkänner är det som tillverkas, så kontrollera namn, titlar och stavning.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Tillverkning och leverans</h2>
        <p>
          Skyltarna tillverkas efter din beställning och skickas inom fem arbetsdagar, räknat från beställningen eller
          från att korrekturet är godkänt.
        </p>
        <p>
          Standardfrakten är varubrev eller paket, beroende på orderns storlek. Väljer du expressfrakt bestäms priset av
          storlek och vikt och meddelas innan ordern skickas.
          {!shop && " Skyltarna går också att hämta hos verkstaden i Högsbo, utan fraktkostnad."}
        </p>
      </section>

      <section className={styles.section}>
        <h2>Ångerrätt</h2>
        <p>
          Skyltarna tillverkas efter dina uppgifter: namn, logga och form. För varor som tillverkas särskilt åt dig gäller
          ingen ångerrätt enligt lagen om distansavtal. Hör av dig direkt om något blev fel i beställningen, så hjälper vi
          dig.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Reklamation</h2>
        <p>
          Är en skylt felaktig eller skadad när den kommer fram rättar vi felet eller ersätter skylten. Hör av dig så snart
          du har upptäckt felet, med ordernumret och gärna en bild.
        </p>
        {!shop && cardPayments && (
          <p>
            Som privatperson har du rätt att reklamera enligt konsumentköplagen i upp till tre år. Kommer vi inte överens kan
            du vända dig till Allmänna reklamationsnämnden, arn.se.
          </p>
        )}
      </section>

      <section className={styles.section}>
        <h2>Personuppgifter</h2>
        <p>
          Vi använder uppgifterna du lämnar för att tillverka, leverera och fakturera ordern. Du kan be oss rätta eller ta
          bort dem. Det som hör till bokföringen måste vi spara i sju år, men då utan namnen på skyltarna.{" "}
          {!shop && (
            <>
              Mer står på sidan <Link href="/integritet">Så hanterar vi uppgifter</Link>.
            </>
          )}
        </p>
      </section>

      <section className={styles.section}>
        <h2>Lag och tvist</h2>
        <p>Svensk lag gäller för köpet. En tvist som vi inte löser tillsammans avgörs av svensk domstol.</p>
      </section>

      <p className={styles.updated}>Villkoren gäller från {UPDATED}.</p>
    </article>
  );
}
