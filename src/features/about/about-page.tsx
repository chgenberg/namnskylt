import Link from "next/link";
import { WORKSHOP_COMPANY } from "@/lib/company/workshop";
import { ABOUT, TEAM } from "./about-copy";
import styles from "./about.module.css";

/**
 * Om oss. namnskylt.com är Skylt & Gravyrtekniks sajt för namnskyltar, så sidan
 * presenterar dem: teambilden och texterna från deras egen sida, i namnskylt.coms
 * form (besked av ägaren 2026-11-18). Kontaktvägarna står på Kontakta oss.
 */
export function AboutPage() {
  const company = WORKSHOP_COMPANY;
  return (
    <article className={styles.page}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>{ABOUT.eyebrow}</p>
        <h1 className={styles.title}>{ABOUT.title}</h1>
        <p className={styles.lead}>{ABOUT.lead}</p>
      </header>

      <figure className={styles.photo}>
        {/* Två beskärningar av samma bild: liggande på bred skärm, stående på mobil. */}
        <picture>
          <source media="(max-width: 640px)" srcSet="/team/team-mobil.webp" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/team/team-desktop.webp" alt={ABOUT.teamAlt} width={1600} height={1066} />
        </picture>
        <figcaption>{ABOUT.teamCaption}</figcaption>
      </figure>

      <section className={styles.story}>
        <div className={styles.prose}>
          {ABOUT.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 24)}>{paragraph}</p>
          ))}
          <p>
            Skylt &amp; Gravyrteknik gör också märkskyltar och annan märkning. Dem hittar du på{" "}
            <a href={company.site} target="_blank" rel="noreferrer">
              skyltochgravyr.com
            </a>
            .
          </p>
        </div>
        <aside className={styles.facts} aria-label={ABOUT.factsTitle}>
          <h2>{ABOUT.factsTitle}</h2>
          <dl>
            <div>
              <dt>Företag</dt>
              <dd>{company.legalName}</dd>
            </div>
            <div>
              <dt>Org.nr</dt>
              <dd>{company.orgNumber}</dd>
            </div>
            <div>
              <dt>Adress</dt>
              <dd>
                {company.street}
                <br />
                {company.zipCity}
              </dd>
            </div>
            <div>
              <dt>Kontakt</dt>
              <dd>
                <a href={`tel:${company.phoneHref}`}>{company.phone}</a>
                <br />
                <a href={`mailto:${company.email}`}>{company.email}</a>
              </dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className={styles.values} aria-label="Det vi står för">
        {ABOUT.values.map((value) => (
          <div key={value.title}>
            <h2>{value.title}</h2>
            <p>{value.text}</p>
          </div>
        ))}
      </section>

      <section className={styles.people}>
        <p className={styles.eyebrow}>{ABOUT.teamEyebrow}</p>
        <h2 className={styles.sectionTitle}>{ABOUT.teamTitle}</h2>
        <p className={styles.sectionLead}>{ABOUT.teamLead}</p>
        <ul className={styles.team}>
          {TEAM.map((member) => (
            <li key={member.name}>
              <p className={styles.role}>{member.role}</p>
              <h3>{member.name}</h3>
              {member.bio.map((paragraph) => (
                <p key={paragraph.slice(0, 24)}>{paragraph}</p>
              ))}
            </li>
          ))}
        </ul>
      </section>

      <div className={styles.actions}>
        <Link href="/skapa" className="btn btn--primary">
          Skapa din skylt
        </Link>
        <Link href="/kontakt" className="btn">
          Kontakta oss
        </Link>
      </div>
    </article>
  );
}
