import { DEMO_CONTACT } from "@/lib/callback/contact";
import type { DemoFilm } from "@/lib/callback/film";
import { CallbackForm } from "./callback-form";
import { DemoBeacon } from "./demo-beacon";
import styles from "./demo.module.css";

/**
 * Sidan som utskicksmejlet länkar till (besked av ägaren 2026-11-25): filmen om hur en återförsäljare
 * kommer igång, numret till Pär för en demo på fem minuter, och ett formulär för att bli uppringd.
 * Ingen butik och ingen aktivering: det tar Pär i samtalet.
 */
export function DemoPage({ token, film }: { token: string | null; film: DemoFilm | null }) {
  return (
    <article className={styles.page}>
      {token ? <DemoBeacon token={token} /> : null}
      <header className={styles.head}>
        <p className={styles.eyebrow}>För återförsäljare</p>
        <h1 className={styles.title}>Namnskyltar åt era kunder, med er logga</h1>
        <p className={styles.lead}>
          Vi på Skylt &amp; Gravyrteknik lanserar nu namnskylt.com – ett enklare sätt att designa namnskyltar med era kunders
          logotyper och skapa färdiga offerter med era egna priser. Vi tillverkar och skickar.
        </p>
        {/* Numret syns utan att rulla, också på en liten telefon där filmen annars skjuter ner korten. */}
        <p className={styles.callLine}>
          <a href={`tel:${DEMO_CONTACT.tel}`}>
            Ring {DEMO_CONTACT.name} på <span className={styles.nowrap}>{DEMO_CONTACT.phone}</span>
          </a>
          , så visar han hur det fungerar på fem minuter.
        </p>
      </header>

      {film ? (
        <figure id="film" className={styles.film}>
          {/* Två filmer, en liggande och en stående. Bara den som syns hämtas, när den spelas. */}
          <video className={styles.wide} controls playsInline preload="none" poster={film.wide.poster}>
            <source src={film.wide.src} type="video/mp4" />
          </video>
          <video className={styles.tall} controls playsInline preload="none" poster={film.tall.poster}>
            <source src={film.tall.src} type="video/mp4" />
          </video>
          <figcaption>Så kommer ni igång, på {film.length}. Filmen är utan ljud.</figcaption>
        </figure>
      ) : null}

      <section className={styles.contact} aria-label="Kontakt">
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Ring {DEMO_CONTACT.firstName}</h2>
          <p className={styles.cardText}>
            {DEMO_CONTACT.name} från Merchin, som utvecklat plattformen tillsammans med oss, visar dig hur det fungerar på fem
            minuter.
          </p>
          <a className="btn btn--primary btn--lg" href={`tel:${DEMO_CONTACT.tel}`}>
            Ring {DEMO_CONTACT.phone}
          </a>
        </div>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Bli uppringd</h2>
          <p className={styles.cardText}>Lämna namn och nummer, så ringer vi upp.</p>
          <CallbackForm token={token} />
        </div>
      </section>

      <ul className={styles.points}>
        <li>Ni gör skyltar och offerter på namnskylt.com, med er logga och era priser.</li>
        <li>Kunden godkänner offerten, och ordern går till Skylt &amp; Gravyrteknik, som tillverkar och skickar.</li>
      </ul>
    </article>
  );
}
