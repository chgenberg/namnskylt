import Link from "next/link";
import { WORKSHOP_COMPANY } from "@/lib/company/workshop";
import styles from "./terms.module.css";

/**
 * Skylt & Gravyrtekniks köpvillkor, ordagrant som de står på
 * skyltochgravyr.com/villkor (hämtade 2026-11-17, på ägarens begäran). De
 * gäller där verkstaden är säljare: på namnskylt.com och i en butik som ingen
 * återförsäljare har tagit över. Texten är deras och ändras inte här: ändrar
 * de sina villkor ska samma ändring göras här, och datumet nedan flyttas.
 */
const WORKSHOP = { ...WORKSHOP_COMPANY, termsUrl: `${WORKSHOP_COMPANY.site}/villkor` } as const;

/** Dagen villkoren hämtades från verkstadens sajt. */
const FETCHED = "2026-11-17";

const SECTIONS = [
  {
    title: "Beställning & priser",
    body: "Priser anges i svenska kronor. Priset i designern beräknas utifrån material, storlek och antal. Bindande avtal uppstår när din beställning bekräftas och betalning genomförts.",
  },
  {
    title: "Produktion & leverans",
    body: "Skyltar tillverkas efter dina specifikationer. Vi påbörjar produktion när betalning bekräftats och skickar därefter med spårbar frakt. Leveranstid meddelas per order.",
  },
  {
    title: "Ångerrätt",
    body: "Eftersom produkterna specialtillverkas efter dina mått och din text gäller ingen ångerrätt enligt distansavtalslagen. Kontakta oss omgående vid fel eller skada så hjälper vi dig.",
  },
] as const;

interface WorkshopTermsProps {
  /** Butiken kunden beställer i, när det inte är på namnskylt.com. */
  shopName?: string;
  /** Länken till sidan om personuppgifter visas bara på namnskylt.com, inte i en butik. */
  privacyLink: boolean;
  /** Privatpersoner kan betala med kort. Bara på namnskylt.com, och bara när kortbetalningen är påslagen. */
  cardPayments: boolean;
}

/**
 * Köpvillkoren där Skylt & Gravyrteknik är säljare. Först deras villkor som de
 * är, sedan det som gäller just här: att namnskylt.com är deras sajt, och vad
 * som händer med uppgifterna kunden lämnar.
 *
 * namnskylt.com står inte som ett eget bolag (besked av ägaren 2026-11-18): det
 * är Skylt & Gravyrteknik som säljer, tillverkar, fakturerar och tar emot frågor.
 */
export function WorkshopTerms({ shopName, privacyLink, cardPayments }: WorkshopTermsProps) {
  return (
    <article className={styles.page}>
      <p className={styles.eyebrow}>Villkor</p>
      <h1 className={styles.title}>Köpvillkor</h1>
      <p className={styles.lead}>
        {shopName
          ? `Namnskyltarna säljs, tillverkas och faktureras av Skylt & Gravyrteknik. Därför gäller deras köpvillkor när du beställer hos ${shopName}.`
          : "namnskylt.com drivs av Skylt & Gravyrteknik, som säljer, tillverkar och fakturerar namnskyltarna. Det här är köpvillkoren."}
      </p>

      <section className={styles.section}>
        <h2>Säljare</h2>
        <p>
          {WORKSHOP.legalName}, org.nr {WORKSHOP.orgNumber}, {WORKSHOP.street}, {WORKSHOP.zipCity}.
        </p>
      </section>

      {SECTIONS.map((section) => (
        <section key={section.title} className={styles.section}>
          <h2>{section.title}</h2>
          <p>{section.body}</p>
        </section>
      ))}

      <section className={styles.section}>
        <h2>Reklamation</h2>
        <p>
          Vid fel i vår tillverkning åtgärdar vi eller ersätter produkten. Kontakta{" "}
          <a href={`mailto:${WORKSHOP.email}`}>{WORKSHOP.email}</a>.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Färger i tryck</h2>
        <p>
          Färgen du väljer för text och logotyp räknas om till tryckfärger när skylten trycks. Nyansen kan därför skilja
          sig något från det du ser på skärmen, mellan olika material och från en tidigare leverans. Vi kan inte lova en
          exakt nyans, till exempel en viss Pantone-färg, och en mindre skillnad i nyans räknas inte som ett fel på
          skylten. Skyltens egen färg är materialets.
        </p>
      </section>

      <section className={styles.section}>
        <h2>{shopName ? `Om ${shopName}` : "Om namnskylt.com"}</h2>
        <p>
          {shopName
            ? `Beställningen görs hos ${shopName} och går till Skylt & Gravyrteknik, som tillverkar, levererar och fakturerar.`
            : "namnskylt.com är Skylt & Gravyrtekniks sajt för namnskyltar. Det är Skylt & Gravyrteknik du beställer av och vänder dig till."}{" "}
          Orderbekräftelsen och fakturan kommer därifrån. Du når oss på{" "}
          <a href={`mailto:${WORKSHOP.email}`}>{WORKSHOP.email}</a> eller <a href={`tel:${WORKSHOP.phoneHref}`}>{WORKSHOP.phone}</a>
          {!shopName && (
            <>
              , och fler vägar står under <Link href="/kontakt">Kontakta oss</Link>
            </>
          )}
          .
        </p>
        {cardPayments && (
          <p>
            Privatpersoner betalar med kort när beställningen läggs. Ordern registreras när betalningen är klar. Som
            privatperson har du rätt att reklamera enligt konsumentköplagen i upp till tre år. Kommer vi inte överens kan
            du vända dig till Allmänna reklamationsnämnden, arn.se.
          </p>
        )}
      </section>

      <section className={styles.section}>
        <h2>Personuppgifter</h2>
        <p>
          Uppgifterna du lämnar används av Skylt &amp; Gravyrteknik för att tillverka, leverera och fakturera ordern.
          Du kan be oss rätta eller ta bort dem. Det som hör till bokföringen måste sparas i sju
          år, men då utan namnen på skyltarna.{" "}
          {privacyLink && (
            <>
              Mer står i <Link href="/integritet">integritetspolicyn</Link>.
            </>
          )}
        </p>
      </section>

      <p className={styles.updated}>
        Köpvillkoren är Skylt &amp; Gravyrtekniks egna, som de stod på{" "}
        <a href={WORKSHOP.termsUrl} target="_blank" rel="noreferrer">
          skyltochgravyr.com/villkor
        </a>{" "}
        {FETCHED}.
      </p>
    </article>
  );
}
