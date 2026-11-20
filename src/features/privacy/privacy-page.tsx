import { WORKSHOP_COMPANY } from "@/lib/company/workshop";
import styles from "./privacy.module.css";

/**
 * Skylt & Gravyrtekniks integritetspolicy, ordagrant som den står på
 * skyltochgravyr.com/integritetspolicy (hämtad 2026-11-17, på ägarens begäran:
 * "de är ansvariga"). Texten är deras och ändras inte här: ändrar de sin
 * policy ska samma ändring göras här, och datumet nedan flyttas.
 */
const FETCHED = "2026-11-17";

const DATA_ITEMS = [
  "Kontouppgifter: namn, e-post, telefon och företag.",
  "Beställningar: dina designer, orderrader, belopp och orderhistorik.",
  "Uppladdat material: logotyper och symboler du sparar i ditt bibliotek.",
  "Teknik: nödvändiga cookies för inloggning och kundvagn.",
  "Google Analytics och Google Ads, bara om du godkänt alla cookies: vilka sidor som besöks, ungefärlig plats, enhet och webbläsare, samt om ett klick på en av våra annonser ledde till ett köp (ordernummer och ordervärde – inte namn eller kontaktuppgifter). Google Ireland Ltd behandlar uppgifterna åt oss, och de kan överföras till USA enligt EU:s och USA:s dataskyddsramverk. Laglig grund: ditt samtycke, som du kan ändra i cookiepolicyn.",
  "Meta Pixel, bara om du godkänt alla cookies: vilka sidor som besöks samt köp med ordernummer och ordervärde – inte namn eller kontaktuppgifter. Meta Platforms Ireland Ltd tar emot uppgifterna och är gemensamt personuppgiftsansvarig med oss för insamlingen; Meta kan använda dem för att visa och mäta annonser på Facebook och Instagram, och de kan överföras till USA enligt EU:s och USA:s dataskyddsramverk. Laglig grund: ditt samtycke, som du kan ändra i cookiepolicyn.",
  "Besöksstatistik: vilka sidor som besöks, utan cookies. IP-adressen sparas inte – besökare räknas med en kod som byts varje dygn, och statistiken raderas efter 90 dagar. Laglig grund: vårt berättigade intresse av att förstå hur sajten används.",
] as const;

const PURPOSE =
  "Vi behandlar uppgifterna för att fullgöra köpeavtalet (leverera och fakturera dina beställningar), uppfylla bokföringslagen samt – om du gett samtycke – skicka nyheter och erbjudanden. Marknadsföring sker endast med ditt uttryckliga samtycke, som du när som helst kan återkalla.";

const RETENTION =
  "Kontouppgifter sparas så länge du har ett konto. Orderunderlag sparas i sju år enligt bokföringslagen, men anonymiseras vid kontoradering så att de inte längre kan kopplas till dig som person.";

/**
 * Integritetspolicyn. Skylt & Gravyrteknik driver namnskylt.com och är
 * personuppgiftsansvarig, så först står deras policy som den är. Sist står det
 * som gäller just den här sajten: vad som sparas här och vad som inte används här.
 * namnskylt.com står inte som ett eget bolag (besked av ägaren 2026-11-18).
 */
export function PrivacyPage() {
  const workshop = WORKSHOP_COMPANY;
  return (
    <article className={styles.page}>
      <p className={styles.eyebrow}>Dataskydd</p>
      <h1 className={styles.title}>Integritetspolicy</h1>
      <p className={styles.lead}>
        namnskylt.com drivs av {workshop.name}, som säljer, tillverkar och fakturerar namnskyltarna och ansvarar för
        personuppgifterna. Det här är integritetspolicyn.
      </p>

      <section className={styles.section}>
        <h2>Personuppgiftsansvarig</h2>
        <p>
          {workshop.legalName} (org.nr {workshop.orgNumber}), {workshop.street}, {workshop.zipCity}. Kontakt:{" "}
          <a href={`mailto:${workshop.email}`}>{workshop.email}</a>.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Vilka uppgifter vi behandlar</h2>
        <ul className={styles.list}>
          {DATA_ITEMS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <h2>Ändamål och laglig grund</h2>
        <p>{PURPOSE}</p>
      </section>

      <section className={styles.section}>
        <h2>Lagringstid</h2>
        <p>{RETENTION}</p>
      </section>

      <section className={styles.section}>
        <h2>Dina rättigheter</h2>
        <p>
          Du har rätt till registerutdrag, rättelse, radering och dataportabilitet. Du kan{" "}
          <a href={`${workshop.site}/konto`} target="_blank" rel="noreferrer">
            exportera eller radera dina data direkt på ditt konto
          </a>
          . Du kan även klaga hos Integritetsskyddsmyndigheten (IMY).
        </p>
      </section>

      <section className={styles.section}>
        <h2>Cookies</h2>
        <p>
          Läs mer om vilka cookies vi använder i vår{" "}
          <a href={`${workshop.site}/cookies`} target="_blank" rel="noreferrer">
            cookiepolicy
          </a>
          .
        </p>
      </section>

      <section className={styles.section}>
        <h2>På namnskylt.com</h2>
        <p>
          namnskylt.com är {workshop.name}s sajt för namnskyltar. När du beställer här sparas namn, e-post, företag,
          organisationsnummer, leveransadress och texten på skyltarna, så att ordern kan tillverkas, levereras och
          faktureras. Du når oss på <a href={`mailto:${workshop.email}`}>{workshop.email}</a> eller{" "}
          <a href={`tel:${workshop.phoneHref}`}>{workshop.phone}</a>.
        </p>
        <p>
          Laddar du ner en offert sparas den hos oss med texten på skyltarna, så att offerten går att godkänna senare.
          Du behöver inte uppge något om dig själv. Fyller du i namn, e-post, företag eller organisationsnummer sparas
          de med offerten. Inget beställs förrän du godkänner den.
        </p>
        <p>
          När du skriver ett organisationsnummer hämtar vi företagets namn och adress ur EU:s momsregister (VIES), så
          att du slipper fylla i dem. Numret för en enskild firma är ägarens personnummer och slås aldrig upp.
        </p>
        <p>
          Skapar du ett konto sparas din e-postadress, ditt lösenord som en envägskod som inte går att läsa, och
          uppgifterna du fyller i kassan, så att du slipper fylla i dem igen och ser dina ordrar. Inloggningen bärs av
          en kaka som behövs för att kontot ska fungera. Du tar själv bort kontot under Mitt konto.
        </p>
        <p>
          Här används bara kakor som behövs för att sajten ska fungera. Google Analytics, Google Ads och Meta Pixel
          används inte på namnskylt.com. Varukorgen och skylten du arbetar med sparas i din webbläsare, så att de finns
          kvar om du laddar om sidan.
        </p>
        <p>
          Vi räknar hur långt besök kommer i skyltmotorn, för att se var det är krångligt. Räkningen sparar inget i din
          webbläsare och ingen IP-adress, och kan inte kopplas till en person.
        </p>
      </section>

      <p className={styles.updated}>
        Integritetspolicyn är {workshop.name}s egen, som den stod på{" "}
        <a href={`${workshop.site}/integritetspolicy`} target="_blank" rel="noreferrer">
          skyltochgravyr.com/integritetspolicy
        </a>{" "}
        {FETCHED}.
      </p>
    </article>
  );
}
