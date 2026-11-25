import { kr, type FaqItem, type SiteFacts } from "@/lib/seo/site-facts";

/**
 * Sidorna om namnskyltar under /namnskyltar (2026-11-25): en sida per sak som företag söker på, efter en
 * genomgång av konkurrenternas sidor. Alla har fäste, material och logga, vård är den vanligaste branschen,
 * och ingen har egna sidor för restaurang och hotell, butik eller mässa. Texterna säger bara det sajten
 * redan gör: priser, frakt och tillval räknas ur prismodellen (`SiteFacts`) när sidan visas.
 */

export type TopicKind = "skylt" | "bransch";

export interface TopicSection {
  heading: string;
  paragraphs: readonly string[];
}

/** En närbild ur skyltmotorns 3D-vy, bredvid exempelskylten. */
export interface TopicPhoto {
  src: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
}

export interface Topic {
  slug: string;
  kind: TopicKind;
  /** Kort namn i listor och brödsmulor: "Med magnet", "Vården". */
  name: string;
  /** Sidans rubrik och titel i sökresultatet. */
  title: string;
  /** Det sökresultatet visar under titeln, 70–160 tecken. */
  description: string;
  lead: string;
  /** En rad om exempelskylten. */
  example: string;
  /** Vilka material priset på sidan gäller. */
  materials: readonly ("metal" | "plastic")[];
  photo?: TopicPhoto;
  sections: (facts: SiteFacts) => readonly TopicSection[];
  faq: (facts: SiteFacts) => readonly FaqItem[];
  related: readonly string[];
}

const DELIVERY = "Skyltarna tillverkas och skickas inom fem arbetsdagar, och korrektur innan produktion ingår.";
const LOGO_FORMATS = "PNG, JPG, SVG, WebP eller GIF";
const NAME_LIST =
  "Gör en skylt och klistra in namnlistan, eller ladda upp den i Excel eller CSV. Då blir det en skylt per namn med samma utseende, och priset per skylt sjunker med antalet.";
const REORDER =
  "När någon ny börjar beställer ni fler med samma design från orderns sida, eller kopierar ordern under Mitt konto och byter namnen.";
const PACEMAKER = "Den som har pacemaker eller annat medicinskt implantat bör välja nål eller klämma i stället för magnet.";

const extra = (sek: number, what: string) => (sek > 0 ? `${what} kostar ${kr(sek)} mer per skylt än nål.` : `${what} kostar inget extra.`);
const logoPrice = (facts: SiteFacts) =>
  facts.extras.logoSek > 0 ? `Loggan kostar från ${kr(facts.extras.logoSek)} per skylt.` : "Loggan kostar inget extra.";

const photo = (slug: string, alt: string, caption: string): TopicPhoto => ({
  src: `/inspiration/${slug}.jpg`,
  width: 960,
  height: 720,
  alt,
  caption,
});

export const TOPICS: readonly Topic[] = [
  {
    slug: "med-logga",
    kind: "skylt",
    name: "Med logga",
    title: "Namnskylt med logga",
    description:
      "Namnskyltar med er logga eller logotyp, i metall eller plast. Ladda upp loggan, se skylten i 3D och beställ till hela personalen på faktura.",
    lead: "Ladda upp er logga, skriv namnet och se skylten i 3D direkt. Samma design räcker till hela personalen.",
    example: "Vit matt metall med loggan och texten printade i grönt, och magnet.",
    materials: ["metal", "plastic"],
    sections: (facts) => [
      {
        heading: "Så kommer loggan på skylten",
        paragraphs: [
          `Ladda upp loggan som ${LOGO_FORMATS}. En vit bakgrund tas bort av sig själv, och loggan läggs bredvid eller ovanför namnet. Du kan flytta den och ändra storleken genom att dra i hörnen.`,
          logoPrice(facts),
        ],
      },
      {
        heading: "Print eller gravyr",
        paragraphs: [
          "På metall printas loggan, i färg som den är i filen eller i en färg. På plast kan den printas eller graveras. Graverad syns den i plastens kärnfärg, till exempel vit i röd plast.",
        ],
      },
      {
        heading: "Färgen på texten",
        paragraphs: [
          "När texten printas läser skyltmotorn av loggans färger och föreslår den som syns bäst mot skylten. Du kan också välja bland 14 färger eller skriva en egen färgkod. Graverad text får plastens kärnfärg. Färgen i trycket kan skilja sig något från skärmen.",
        ],
      },
      { heading: "En design till alla", paragraphs: [NAME_LIST] },
    ],
    faq: (facts) => [
      { question: "Kostar loggan extra?", answer: `${logoPrice(facts)} Det gäller både en printad och en graverad logga.` },
      { question: "Vilka filer kan vi ladda upp?", answer: `${LOGO_FORMATS}. En vit bakgrund tas bort av sig själv.` },
      { question: "Kan loggan vara i färg?", answer: "Ja. En logga i färg printas som den är i filen, på både metall och plast." },
      { question: "Kan vi se skylten innan vi beställer?", answer: `Ja, i 3D medan du formger den. ${DELIVERY}` },
    ],
    related: ["metall", "plast", "butik", "massa-och-event"],
  },
  {
    slug: "metall",
    kind: "skylt",
    name: "I metall",
    title: "Namnskylt i metall – mässing, nickel eller vit",
    description:
      "Namnskyltar i metall: mässing, nickel eller vit matt lackad aluminium, i fem format. Namn och logga printas. Nål eller magnet.",
    lead: "Tunna metallämnen i tre ytor, med namn, titel och logga printade i den färg du väljer.",
    example: "Mässing, rektangel 60 × 30 mm, med nål.",
    materials: ["metal"],
    sections: () => [
      {
        heading: "Tre ytor",
        paragraphs: [
          "Mässing har en varm guldton och nickel en svalare silverton, båda borstade. Vit matt är lackad aluminium. Mässing och nickel är cirka 0,5 mm tjocka och vit matt 0,8 mm.",
        ],
      },
      {
        heading: "Fem format",
        paragraphs: [
          "Rektangel 60 × 30 mm, smal rektangel 60 × 18 mm, TV-bricka 62 × 32 mm, oval 63 × 32 mm och välvd oval 59 × 34 mm.",
        ],
      },
      {
        heading: "Print på metall",
        paragraphs: [
          "Namn, titel och logga printas på metallen. Texten får en av 14 färger eller en egen färgkod, och en logga i färg printas som den är i filen.",
          "Vill du ha gravyr, ram eller egen form väljer du plast.",
        ],
      },
    ],
    faq: (facts) => [
      { question: "Kan man gravera i metallskylten?", answer: "Nej, metallskyltarna printas. Gravyr finns på plastskyltarna, där gravyren går genom ytan." },
      { question: "Vilka fästen finns till metallskylten?", answer: `Nål eller magnet. ${extra(facts.extras.magnetSek, "Magneten")} Klämman finns bara på plastskyltar.` },
      { question: "Vad är skillnaden mellan mässing och nickel?", answer: "Färgen: mässing har en varm guldton och nickel en svalare silverton. Båda är borstade." },
    ],
    related: ["plast", "med-logga", "med-magnet", "restaurang-och-hotell"],
  },
  {
    slug: "plast",
    kind: "skylt",
    name: "I plast",
    title: "Graverad namnskylt i plast",
    description:
      "Graverade namnskyltar i tvålagers gravyrplast, 1,5 mm, i 17 färgkombinationer. Egen form, ram och fäste med nål, magnet eller klämma.",
    lead: "Gravyrplast i två lager: namnet fräses genom ytan, så att kärnans färg syns.",
    example: "Mörkblå plast med vit gravyr, rektangel 75 × 25 mm, med nål.",
    materials: ["plastic"],
    photo: photo("lakare-yta", "En vit plastskylt med svart gravyr, på nära håll", "Vit gravyrplast med svart gravyr, i skyltmotorns 3D-vy."),
    sections: (facts) => [
      {
        heading: "Gravyr i två lager",
        paragraphs: [
          "Plasten är 1,5 mm och har en yta och en kärna i olika färg. Namnet graveras genom ytan, så att det syns i kärnans färg.",
        ],
      },
      {
        heading: "17 färgkombinationer",
        paragraphs: [
          "Vit med svart, blå eller röd gravyr. Svart, blå, mörkblå, röd, grön, mörkgrön, grå, orange, brun och mörkbrun med vit gravyr. Grön, gul, guld och silver med svart gravyr.",
        ],
      },
      {
        heading: "Format och egen form",
        paragraphs: [
          "Rektangel 75 × 25 mm, lång rektangel 80 × 25 mm, kudde 75 × 35 mm, stor rektangel 75 × 45 mm och oval 70 × 40 mm. Eller en egen form på upp till 120 × 120 mm.",
        ],
      },
      {
        heading: "Print, ram och fäste",
        paragraphs: [
          `Namn och logga kan också printas på plasten, eller kombineras: namnet graverat och loggan printad. En ram, enkel eller dubbel, kostar från ${kr(facts.extras.frameSek)} per skylt.`,
          "Plastskylten får nål, magnet eller, från 80 × 25 mm, klämma.",
        ],
      },
    ],
    faq: () => [
      { question: "Vad är gravyrplast?", answer: "En plast i två lager med olika färg. Gravyren går genom ytan, så att texten syns i kärnans färg." },
      { question: "Hur tjock är plastskylten?", answer: "1,5 mm." },
      {
        question: "Kan plastskylten få klämma?",
        answer: "Ja, om skylten är minst 80 × 25 mm: välj lång rektangel eller en egen form som är stor nog.",
      },
    ],
    related: ["metall", "egen-form", "med-klamma", "vard"],
  },
  {
    slug: "med-magnet",
    kind: "skylt",
    name: "Med magnet",
    title: "Namnskylt med magnet",
    description:
      "Namnskyltar med magnetfäste, som sitter utan att göra hål i kläderna. I metall eller plast, med namn, titel och logga.",
    lead: "Magneten håller skylten genom tyget, så att kläderna slipper hål.",
    example: "Nickel, oval 63 × 32 mm, med magnet.",
    materials: ["metal", "plastic"],
    photo: photo("bil-faste", "Baksidan av en namnskylt med magnetfäste", "Magnetfästet på skyltens baksida, i skyltmotorns 3D-vy."),
    sections: (facts) => [
      {
        heading: "Inga hål i kläderna",
        paragraphs: [
          "Magneten har två delar: en platta på skyltens baksida och en hållare som sitter innanför plagget. Skylten hålls på plats genom tyget, och inget går igenom det.",
        ],
      },
      {
        heading: "När magnet passar",
        paragraphs: [
          "På kläder som inte ska ha hål, och när skylten flyttas mellan plagg. Magneten finns till både metall- och plastskyltar.",
          PACEMAKER,
        ],
      },
      { heading: "Pris", paragraphs: [extra(facts.extras.magnetSek, "Magneten")] },
    ],
    faq: (facts) => [
      { question: "Gör magneten hål i kläderna?", answer: "Nej. Hållaren sitter innanför plagget och håller skylten genom tyget." },
      { question: "Vad kostar magneten?", answer: extra(facts.extras.magnetSek, "Magneten") },
      { question: "Kan man ha magnet med pacemaker?", answer: PACEMAKER },
    ],
    related: ["med-nal", "med-klamma", "restaurang-och-hotell", "vard"],
  },
  {
    slug: "med-nal",
    kind: "skylt",
    name: "Med nål",
    title: "Namnskylt med nål",
    description:
      "Namnskyltar med nålfäste, det enklaste och billigaste fästet. I metall eller plast, med namn, titel och logga. Nålen ingår i priset.",
    lead: "Det klassiska fästet: en nål med lås på skyltens baksida. Nålen ingår i priset per skylt.",
    example: "Svart plast med vit gravyr, rektangel 75 × 25 mm, med nål.",
    materials: ["metal", "plastic"],
    photo: photo("ica-faste", "Baksidan av en namnskylt med nålfäste", "Nålfästet på skyltens baksida, i skyltmotorns 3D-vy."),
    sections: () => [
      {
        heading: "Så sitter nålen",
        paragraphs: ["Nålen sitter på en list på skyltens baksida. Den sticks genom tyget och låses, så att skylten sitter kvar hela dagen."],
      },
      {
        heading: "När nål passar",
        paragraphs: [
          "På kavajer, västar, skjortor och förkläden som tål ett litet hål. Ska plagget inte få hål väljer du magnet, eller klämma på bröstfickan.",
        ],
      },
    ],
    faq: (facts) => [
      { question: "Ingår nålen i priset?", answer: "Ja. Priserna på sajten gäller med nål." },
      { question: "Gör nålen hål i kläderna?", answer: `Ett litet hål, som en vanlig nål. ${extra(facts.extras.magnetSek, "Magnet, som inte gör hål,")}` },
    ],
    related: ["med-magnet", "med-klamma", "plast", "butik"],
  },
  {
    slug: "med-klamma",
    kind: "skylt",
    name: "Med klämma",
    title: "Namnskylt med klämma (militärklämma)",
    description:
      "Namnskyltar med klämma, även kallad militärklämma, som fästs på bröstfickan utan hål. Gravyrplast från 80 × 25 mm, liggande eller stående.",
    lead: "Klämman sätts fast över kanten på bröstfickan, utan att något går igenom tyget.",
    example: "Vit plast med svart gravyr, lång rektangel 80 × 25 mm, med klämma.",
    materials: ["plastic"],
    photo: photo("lakare-faste", "Baksidan av en namnskylt med klämma", "Klämman på skyltens baksida, i skyltmotorns 3D-vy."),
    sections: (facts) => [
      {
        heading: "Klämman",
        paragraphs: [
          "En stålklämma på skyltens baksida, med en fjäderarm som går över kanten på fickan. Den kallas ofta militärklämma.",
        ],
      },
      {
        heading: "Liggande eller stående",
        paragraphs: ["Du väljer om klämman ska sitta liggande eller stående, efter hur skylten ska bäras."],
      },
      {
        heading: "Format",
        paragraphs: [
          "Klämman finns på plastskyltar som är minst 80 × 25 mm: lång rektangel, eller en egen form som är stor nog. Metallskyltarna är mindre och får nål eller magnet.",
          extra(facts.extras.clipSek, "Klämman"),
        ],
      },
    ],
    faq: (facts) => [
      { question: "Är klämma och militärklämma samma sak?", answer: "Ja, militärklämma är ett annat namn för samma fäste." },
      { question: "Varför finns klämman bara på plast?", answer: "Klämman behöver en skylt på minst 80 × 25 mm, och metallskyltarna är mindre." },
      { question: "Vad kostar klämman?", answer: extra(facts.extras.clipSek, "Klämman") },
    ],
    related: ["vard", "plast", "med-magnet", "med-nal"],
  },
  {
    slug: "egen-form",
    kind: "skylt",
    name: "Egen form",
    title: "Namnskylt med egen form",
    description:
      "Namnskylt i egen form, till exempel en bil, ett hus eller er symbol. Välj ett förslag, ladda upp en fil eller beskriv formen med ord.",
    lead: "Gravyrplasten skärs ur ark, så skylten kan få nästan vilken form som helst.",
    example: "Blå plast i form av en bil, 92 × 44 mm, med magnet.",
    materials: ["plastic"],
    photo: photo("bil-form", "En blå namnskylt i form av en bil", "En skylt i egen form, rakt framifrån i skyltmotorns 3D-vy."),
    sections: (facts) => [
      {
        heading: "Tre sätt att få formen",
        paragraphs: [
          "Välj ett av formförslagen och dra i punkterna. Ladda upp en SVG, PNG, JPG eller PDF, så spåras formen ur filen. Eller beskriv formen med ord, så ritar skyltmotorn ett förslag som du kan justera.",
        ],
      },
      {
        heading: "Mått",
        paragraphs: ["Skylten får vara upp till 120 × 120 mm. Bredden och höjden skriver du in, och hörnen kan rundas."],
      },
      {
        heading: "Pris och material",
        paragraphs: [
          `Egen form kostar från ${kr(facts.extras.customShapeSek)} per skylt. Den finns på plastskyltar, som skärs ur ark. Metallskyltarna är färdiga ämnen i fem format.`,
        ],
      },
    ],
    faq: (facts) => [
      { question: "Vilka filer kan formen ritas från?", answer: "SVG, PNG, JPG eller PDF. Av en PDF läses första sidan." },
      { question: "Hur stor får skylten vara?", answer: "Upp till 120 × 120 mm." },
      { question: "Vad kostar egen form?", answer: `Från ${kr(facts.extras.customShapeSek)} per skylt, utöver skylten.` },
      { question: "Kan metallskylten få egen form?", answer: "Nej. Egen form finns på plastskyltar." },
    ],
    related: ["plast", "med-logga", "med-klamma", "massa-och-event"],
  },
  {
    slug: "vard",
    kind: "bransch",
    name: "Vården",
    title: "Namnskyltar för sjukvård och omsorg",
    description:
      "Namnskyltar för sjukvård och omsorg: tydligt namn och yrkesroll, en färg per roll. Klämma eller magnet som inte gör hål i kläderna.",
    lead: "Patienterna ska se vem som tar hand om dem. Ett stort namn, yrkesrollen under och en färg per roll gör det lätt.",
    example: "Vit plast med blå gravyr, lång rektangel 80 × 25 mm, med klämma.",
    materials: ["plastic", "metal"],
    photo: photo("lakare-faste", "Baksidan av en namnskylt med klämma", "Klämman, som sätts på bröstfickan."),
    sections: () => [
      {
        heading: "Namn och yrkesroll",
        paragraphs: [
          "Namnet står stort i fet stil, och yrkesrollen under: leg. sjuksköterska, undersköterska, läkare. Alla namn i samma design får samma typsnitt och utseende.",
        ],
      },
      {
        heading: "En färg per yrkesroll",
        paragraphs: [
          "Många vårdgivare skiljer yrkesrollerna åt med färg. Gravyrplasten finns i 17 färgkombinationer, så varje roll kan få sin. Lägg en design per roll i samma varukorg, så räknas mängdrabatten på alla.",
        ],
      },
      {
        heading: "Fäste utan hål",
        paragraphs: [
          "Klämman sätts på bröstfickan och finns på plastskyltar från 80 × 25 mm. Magneten håller skylten genom tyget.",
          PACEMAKER,
        ],
      },
      { heading: "Hela avdelningen på en gång", paragraphs: [NAME_LIST, REORDER] },
    ],
    faq: () => [
      { question: "Vilket fäste passar i vården?", answer: "Klämma på bröstfickan eller magnet, som inte gör hål i kläderna. Nål går också." },
      {
        question: "Kan vi ha olika färg per yrkesroll?",
        answer: "Ja. Gör en design per roll och lägg alla i samma varukorg. Priset per skylt räknas på hela ordern.",
      },
      { question: "Hur beställer vi till nyanställda?", answer: REORDER },
    ],
    related: ["med-klamma", "plast", "med-magnet", "restaurang-och-hotell"],
  },
  {
    slug: "restaurang-och-hotell",
    kind: "bransch",
    name: "Restaurang och hotell",
    title: "Namnskyltar för restaurang, café och hotell",
    description:
      "Namnskyltar för restaurang-, café- och hotellpersonal: mässing eller nickel i receptionen och baren, plast i era färger. Magnet utan hål i uniformen.",
    lead: "Gästerna ser vem som hjälper dem och kan tilltala personalen med namn.",
    example: "Mässing, oval 63 × 32 mm, med magnet.",
    materials: ["metal", "plastic"],
    sections: () => [
      {
        heading: "Material som passar miljön",
        paragraphs: [
          "Mässing och nickel passar receptionen, baren och matsalen. Gravyrplasten finns i 17 färgkombinationer, så skylten kan gå i husets färger, med loggan graverad eller printad.",
        ],
      },
      {
        heading: "Magnet eller nål",
        paragraphs: ["Magneten gör inga hål i uniformen och flyttas lätt mellan plagg. Nålen är det enklaste och billigaste fästet."],
      },
      { heading: "Nya i personalen", paragraphs: [REORDER, "Det går att beställa en enda skylt."] },
    ],
    faq: () => [
      { question: "Kan vi beställa en skylt i taget?", answer: "Ja. Priset per skylt sjunker med antalet, så det lönar sig att samla flera namn i samma order." },
      { question: "Hur snabbt kommer skyltarna?", answer: DELIVERY },
      { question: "Vilket fäste passar på uniformen?", answer: "Magnet, som inte gör hål, eller nål." },
    ],
    related: ["metall", "med-magnet", "butik", "med-logga"],
  },
  {
    slug: "butik",
    kind: "bransch",
    name: "Butik och handel",
    title: "Namnskyltar för butik och handel",
    description:
      "Namnskyltar för butikspersonal med kedjans logga, i metall eller plast. En design för alla butiker, namnlista i Excel och leverans till flera adresser.",
    lead: "Kunden hittar rätt person, och skylten bär kedjans logga och färger.",
    example: "Röd plast med vit gravyr och graverad logga, rektangel 75 × 25 mm, med nål.",
    materials: ["plastic", "metal"],
    sections: (facts) => [
      {
        heading: "Logga och färger",
        paragraphs: [
          "Ladda upp kedjans logga och välj en plastfärg som går i profilen, eller metall med loggan printad i färg.",
        ],
      },
      { heading: "Alla på en gång", paragraphs: [NAME_LIST] },
      {
        heading: "Till flera butiker",
        paragraphs: [
          `Skriv i leveransspecifikationen vilka namn som ska till vilken butik, så delar vi upp ordern. Varje extra adress kostar ${kr(facts.extraDeliverySek)} i frakt.`,
        ],
      },
      { heading: "Nya medarbetare", paragraphs: [REORDER] },
    ],
    faq: (facts) => [
      {
        question: "Kan skyltarna skickas till flera butiker?",
        answer: `Ja. Skriv i leveransspecifikationen vilka namn som ska till vilken butik. Varje extra adress kostar ${kr(facts.extraDeliverySek)} i frakt.`,
      },
      { question: "Kan alla ha olika titel?", answer: "Ja. Varje namn kan ha sin egen titel på raden under." },
      { question: "Hur betalar vi?", answer: "Mot faktura. Ange företagets organisationsnummer när ni beställer." },
    ],
    related: ["med-logga", "plast", "med-nal", "massa-och-event"],
  },
  {
    slug: "massa-och-event",
    kind: "bransch",
    name: "Mässa och event",
    title: "Namnskyltar för mässa, konferens och event",
    description:
      "Namnskyltar och namnbrickor med logga till mässan, konferensen eller eventet. Ladda upp namnlistan och få en skylt per namn.",
    lead: "Ladda upp listan med namn och få en skylt per person, med er logga och era färger.",
    example: "Vit matt metall, TV-bricka 62 × 32 mm, med loggan och texten printade i blått, och magnet.",
    materials: ["metal", "plastic"],
    sections: (facts) => [
      { heading: "Hela listan på en gång", paragraphs: [NAME_LIST] },
      {
        heading: "Er logga, era färger",
        paragraphs: ["Loggan printas i färg på metall, och skyltmotorn föreslår den färg ur loggan som syns bäst mot skylten."],
      },
      {
        heading: "Beställ i god tid",
        paragraphs: [
          `${DELIVERY} Varubrev med PostNord kostar ${kr(facts.letterSek)} och delas ut varannan vardag, och paket med DHL kostar ${kr(facts.parcelSek)} och går snabbare. Ni kan också hämta skyltarna i Högsbo, Göteborg.`,
        ],
      },
    ],
    faq: (facts) => [
      { question: "Hinner skyltarna fram till eventet?", answer: `Räkna med fem arbetsdagar till tillverkning och utskick, och sedan transporten. Välj paket för ${kr(facts.parcelSek)} om det är bråttom, eller hämta i Högsbo, Göteborg.` },
      { question: "Kan vi ladda upp en deltagarlista?", answer: "Ja, i Excel eller CSV. Det blir en skylt per namn med samma utseende." },
      { question: "Vilket fäste passar på mässan?", answer: "Magnet, som inte gör hål i kläderna, eller nål." },
    ],
    related: ["med-logga", "med-magnet", "metall", "butik"],
  },
];

export function getTopic(slug: string): Topic | null {
  return TOPICS.find((topic) => topic.slug === slug) ?? null;
}

export const TOPIC_HUB = {
  path: "/namnskyltar",
  title: "Namnskyltar och namnbrickor",
  description:
    "Namnskyltar och namnbrickor till företag: i metall och plast, med logga, magnet, nål eller klämma, för vård, restaurang, hotell, butik och mässa.",
} as const;

export const topicPath = (topic: Pick<Topic, "slug">) => `${TOPIC_HUB.path}/${topic.slug}`;
