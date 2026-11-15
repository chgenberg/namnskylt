import Link from "next/link";
import { assetPath, badgeCaption } from "@/lib/outreach/badge-asset";
import type { LandingData, LandingTile } from "@/lib/outreach/landing-data";
import { firstNameOf } from "@/lib/outreach/model";
import { ActivatePanel } from "./activate-panel";
import { LandingBeacon } from "./landing-beacon";
import styles from "./landing.module.css";

export interface OutreachLandingProps {
  token: string;
  data: LandingData;
  selected: LandingTile | null;
  calendlyUrl: string | null;
}

function benefits(hasLogo: boolean): string[] {
  return [
    hasLogo ? "En egen butik med er logga och era priser." : "En egen butik med ert namn och era priser.",
    "Kunden ser skylten i 3D innan den beställs.",
    "Skylt & Gravyrteknik tillverkar — ni har inget lager.",
  ];
}

export function OutreachLanding({ token, data, selected, calendlyUrl }: OutreachLandingProps) {
  const { lead, hero, persona, tiles } = data;
  const company = lead.companyName;
  const hasLogo = hero.logoStatus === "logo";
  const shown = selected ?? persona ?? hero;
  const showingPersona = !selected && persona !== null;
  // Bildtexten gäller skylten på bilden som visas — personbilden kan vara äldre än skyltbilden.
  const caption = badgeCaption(persona ?? hero);
  const shopHref = `/for/${token}/butik${selected ? `?f=${selected.id}` : ""}`;
  const greetingName = firstNameOf(lead.contactName);

  return (
    <main className={styles.page}>
      <LandingBeacon token={token} />
      <header className={styles.bar}>
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG-logga, ingen optimering behövs */}
        <img src="/logo-namnskylt.svg" alt="namnskylt.com" className={styles.brand} />
        <span className={styles.to}>Till {company}</span>
      </header>

      <section className={styles.hero}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>Förberett åt {company}</p>
          <h1 className={styles.title}>{greetingName ? `${greetingName}, här är er skylt.` : "Här är er skylt."}</h1>
          <p className={styles.lead}>
            Vi har byggt en butik där era kunder designar och beställer namnskyltar — med{" "}
            {hasLogo ? "er logga" : "ert namn"} redan på plats. Prova den som en kund gör.
          </p>
          <div className={styles.actions}>
            <a href={shopHref} className="btn btn--primary btn--lg">
              Öppna butiken
            </a>
            <a href="#aktivera" className="btn btn--ghost btn--lg">
              Aktivera butiken
            </a>
          </div>
        </div>
        <figure className={showingPersona ? `${styles.figure} ${styles.portrait}` : styles.figure}>
          {/* eslint-disable-next-line @next/next/no-img-element -- bilden är redan en färdig JPEG */}
          <img
            src={assetPath(shown.id)}
            width={shown.width}
            height={shown.height}
            alt={showingPersona ? `AI-genererad person som bär en namnskylt åt ${company}` : `Namnskylt åt ${company}`}
            className={styles.badge}
          />
          <figcaption className={styles.caption}>
            {selected
              ? selected.label
              : showingPersona
                ? `AI-genererad bild. Skylten finns på riktigt: ${caption}.`
                : `Fig. 1 — ${caption}`}
          </figcaption>
        </figure>
      </section>

      {tiles.length > 0 && (
        <section className={styles.section} aria-labelledby="material">
          <h2 id="material" className={styles.sectionTitle}>
            Samma skylt i andra former och ytor
          </h2>
          <ul className={styles.tiles}>
            {tiles.map((tile) => (
              <li key={tile.id}>
                <Link
                  href={`/for/${token}?f=${tile.id}#material`}
                  className={styles.tile}
                  aria-current={tile.id === selected?.id ? "true" : undefined}
                  scroll={false}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- färdig JPEG */}
                  <img src={assetPath(tile.id)} width={tile.width} height={tile.height} alt="" />
                  <span>{tile.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Så fungerar det</h2>
        <ol className={styles.steps}>
          {benefits(hasLogo).map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ol>
      </section>

      <section id="aktivera" className={styles.activate}>
        <div>
          <h2 className={styles.sectionTitle}>Aktivera butiken</h2>
          <p className={styles.muted}>
            Skapa ett konto så blir butiken er. Ni ändrar texter, bilder och priser själva och ser varje beställning.
          </p>
        </div>
        <ActivatePanel token={token} />
      </section>

      <footer className={styles.footer}>
        <p>
          Hellre prata först? Svara på mejlet så ringer vi
          {calendlyUrl ? (
            <>
              , eller <a href={calendlyUrl}>boka ett samtal</a>.
            </>
          ) : (
            "."
          )}
        </p>
        <p>
          <Link href="/integritet">Så hanterar vi uppgifter</Link>
        </p>
      </footer>
    </main>
  );
}

export function OutreachLandingGone() {
  return (
    <main className={styles.page}>
      <section className={styles.gone}>
        <p className={styles.eyebrow}>namnskylt.com</p>
        <h1 className={styles.title}>Länken gäller inte längre</h1>
        <p className={styles.lead}>Den har gått ut eller är fel. Svara på mejlet du fick, så skickar vi en ny.</p>
        <p>
          <Link href="/integritet">Så hanterar vi uppgifter</Link>
        </p>
      </section>
    </main>
  );
}
