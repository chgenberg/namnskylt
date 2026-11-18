import Link from "next/link";
import { WORKSHOP_COMPANY } from "@/lib/company/workshop";
import { CONTACT, TEAM } from "./about-copy";
import styles from "./about.module.css";

/**
 * Kontakta oss. Det är Skylt & Gravyrteknik man kontaktar, eftersom namnskylt.com är
 * deras sajt: telefon, e-post, adress och öppettider som på deras egen kontaktsida, och
 * de direkta vägarna till rätt person som på deras Om oss (besked av ägaren 2026-11-18).
 */
export function ContactPage() {
  const company = WORKSHOP_COMPANY;
  const address = `${company.street}, ${company.zipCity}`;
  // Varje kontaktväg med personen bakom den, i den ordning kunden oftast behöver dem.
  // "Kontakta Mats" är en knapptext hos dem. Här står rollen som rubrik, som för de andra.
  const people = TEAM.flatMap((member) =>
    member.contacts.map((contact) => ({ ...contact, name: member.name, label: contact.label.startsWith("Kontakta") ? member.role : contact.label })),
  );
  const ordered = [...people].sort((a, b) => Number(b.label === "Beställningar") - Number(a.label === "Beställningar"));
  return (
    <article className={styles.page}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>{CONTACT.eyebrow}</p>
        <h1 className={styles.title}>{CONTACT.title}</h1>
        <p className={styles.lead}>{CONTACT.lead}</p>
      </header>

      <section className={styles.ways}>
        <div>
          <h2>{CONTACT.phone}</h2>
          <a className={styles.big} href={`tel:${company.phoneHref}`}>
            {company.phone}
          </a>
        </div>
        <div>
          <h2>{CONTACT.email}</h2>
          <a className={styles.big} href={`mailto:${company.email}`}>
            {company.email}
          </a>
        </div>
        <div>
          <h2>{CONTACT.visit}</h2>
          <p>
            {company.legalName}
            <br />
            {company.street}
            <br />
            {company.zipCity}
          </p>
          <p>
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer">
              {CONTACT.directions}
            </a>
          </p>
        </div>
        <div>
          <h2>{CONTACT.hours}</h2>
          <p>
            {CONTACT.place}
            <br />
            {company.hours}
          </p>
          <p>{CONTACT.pickup}</p>
        </div>
      </section>

      <section className={styles.people}>
        <h2 className={styles.sectionTitle}>{CONTACT.peopleTitle}</h2>
        <ul className={styles.contacts}>
          {ordered.map((contact) => (
            <li key={contact.label}>
              <p className={styles.role}>{contact.label}</p>
              <h3>{contact.name}</h3>
              <p>
                <a href={`tel:${contact.phoneHref}`}>{contact.phone}</a>
                <br />
                <a href={`mailto:${contact.email}`}>{contact.email}</a>
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.company}>
        <h2>{CONTACT.companyTitle}</h2>
        <p>
          {company.legalName}, org.nr {company.orgNumber}. namnskylt.com är vår sajt för namnskyltar. Märkskyltar och
          annan märkning hittar du på{" "}
          <a href={company.site} target="_blank" rel="noreferrer">
            skyltochgravyr.com
          </a>
          .
        </p>
      </section>

      <div className={styles.actions}>
        <Link href="/skapa" className="btn btn--primary">
          Skapa din skylt
        </Link>
        <Link href="/om-oss" className="btn">
          Om oss
        </Link>
      </div>
    </article>
  );
}
