import styles from "./privacy.module.css";

/**
 * Integritetsinformationen som mejlets sidfot länkar till. Hakparenteserna
 * fylls i när avsändarbolaget och den rättsliga grunden är bekräftade.
 */
export function PrivacyPage() {
  return (
    <article className={styles.page}>
      <p className={styles.eyebrow}>Integritet</p>
      <h1 className={styles.title}>Så hanterar vi uppgifter</h1>
      <p className={styles.lead}>
        Den här sidan gäller mejlen vi skickar till återförsäljare om namnskyltsbutiken, och butikerna vi förbereder åt dem.
      </p>

      <section className={styles.section}>
        <h2>Vem som ansvarar</h2>
        <p>[Juridiskt namn AB], org.nr [556000-0000], [postadress]. Frågor skickar du till [e-postadress].</p>
      </section>

      <section className={styles.section}>
        <h2>Vilka uppgifter vi använder</h2>
        <p>
          Företagets namn, ort och webbplats, kontaktpersonens namn och e-postadress i tjänsten, och när företaget blev kund
          hos oss. Från företagets webbplats hämtar vi logga och färger för att visa en skylt och en butik.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Varför</h2>
        <p>
          Ni är redan kund hos oss, och mejlet handlar om en tjänst som hör till det ni köper. Den rättsliga grunden är
          berättigat intresse [bekräftas]. Vi skickar högst två mejl och slutar direkt om ni avregistrerar er eller svarar att
          ni inte är intresserade.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Hur länge</h2>
        <p>
          En förberedd butik som inte aktiveras tas bort efter [90] dagar. En avregistrering sparar vi så länge vi skickar
          utskick, så att vi aldrig mejlar adressen igen.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Vem mer som ser uppgifterna</h2>
        <p>
          Mejlen skickas via Resend (biträde, servrar inom EU). Beställningar tillverkas av Skylt &amp; Gravyrteknik, som bara
          får det som ska graveras och levereras.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Era rättigheter</h2>
        <p>
          Ni kan när som helst avregistrera er via länken i mejlet, begära ut eller rätta uppgifterna, eller be oss radera
          dem. Ni kan också klaga hos Integritetsskyddsmyndigheten (IMY).
        </p>
      </section>
    </article>
  );
}
