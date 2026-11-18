/**
 * Texterna på Om oss och Kontakta oss. namnskylt.com är Skylt & Gravyrtekniks sajt för
 * namnskyltar (besked av ägaren 2026-11-18: "vår sida är ju deras sida. Det är de som står
 * för allt och de man kontaktar"), så beskrivningen är deras egen, hämtad från
 * skyltochgravyr.com/om-oss och /kontakt samma dag. Det som där gäller märkskyltar är
 * skrivet om för namnskyltar; resten står som hos dem. Ändrar de sin sida ska samma ändring
 * göras här: ingenting hämtas automatiskt.
 */

export const ABOUT = {
  eyebrow: "Om oss",
  title: "Namnskyltar utan krångel",
  lead: "namnskylt.com är Skylt & Gravyrtekniks sajt för namnskyltar. Vi gör skyltarna i vår produktion i Göteborg och levererar till hela Sverige. Smidig skyltmotor, konkurrenskraftiga priser och snabba leveranser.",
  teamAlt: "Teamet på Skylt & Gravyrteknik utanför produktionen i Högsbo",
  teamCaption: "Teamet i Högsbo, Göteborg.",
  paragraphs: [
    "Alla verksamheter har olika behov. Vissa behöver en handfull namnskyltar till ett nytt team, andra till hela personalen på en gång. Vi har lagt energi på att det inte ska vara krångligt att få fram rätt skylt. Det ska gå snabbt och smidigt.",
    "Du gör skylten själv på några minuter i skyltmotorn: namn, logga, material och fäste. Har ni många namn laddar du upp listan, så får alla samma design.",
    "Den gemensamma nämnaren för det mesta vi gör är att det är bråttom. Därför har vi satt en ära i att alltid göra allt för att hålla din tidsplan.",
  ],
  factsTitle: "Kort om oss",
  values: [
    { title: "Snabbt", text: "Det är ofta bråttom. Vi planerar verksamheten för att hålla din tidsplan, inte tvärtom." },
    { title: "Enkelt", text: "Du ska inte behöva vara expert. Skyltmotorn gör det snabbt att bygga rätt skylt." },
    { title: "Kvalitet", text: "Rätt material, ren märkning och en skylt som håller där den sitter." },
  ],
  teamEyebrow: "Personalen",
  teamTitle: "Människorna bakom skyltarna",
  teamLead: "Med decennier av samlad erfarenhet i produktionen vet vi vad som fungerar, och vi finns här när du behöver oss.",
} as const;

interface TeamContact {
  label: string;
  phone: string;
  phoneHref: string;
  email: string;
}

interface TeamMember {
  name: string;
  role: string;
  bio: readonly string[];
  contacts: readonly TeamContact[];
}

/** Personalen, som den presenteras på skyltochgravyr.com/om-oss. */
export const TEAM: readonly TeamMember[] = [
  {
    name: "Mats Bergqvist",
    role: "VD / Marknad",
    bio: [
      "Mats har en lång erfarenhet inom B2B och ett utvecklat sinne för affärer.",
      "I slutet av 2014 gjorde Mats entré hos Skylt & Gravyrteknik och sedan dess har många nya kundrelationer skapats med goda resultat för både oss och våra kunder.",
    ],
    contacts: [{ label: "Kontakta Mats", phone: "031-709 02 92 / 0735-34 20 54", phoneHref: "+46317090292", email: "mats.bergqvist@skyltochgravyr.com" }],
  },
  {
    name: "Sandra Bergqvist",
    role: "Order / Ekonomi / HR",
    bio: [
      "Sandra har varit hos oss i cirka 24 år och har ett genuint kunnande inom branschen.",
      "Ett trevligt bemötande och en lösningsorientering när det gäller både produkt- och ekonomiska ärenden är kännetecknande för Sandra.",
    ],
    contacts: [
      { label: "Beställningar", phone: "031-709 02 91", phoneHref: "+46317090291", email: "order@skyltochgravyr.com" },
      { label: "Ekonomifrågor", phone: "031-709 02 93 / 0762-70 90 21", phoneHref: "+46317090293", email: "sandra.bergqvist@skyltochgravyr.com" },
    ],
  },
  {
    name: "Patrik Jönsson",
    role: "Produktion",
    bio: [
      "Patrik är vårt ”uppslagsverk” inom teknisk skyltning. Han kan det mesta inom maskinteknik och vad som är möjligt och inte.",
      "Det är även Patrik som lagar våra maskiner samt ritar upp de flesta korrekturen och de mer komplicerade panelerna.",
    ],
    contacts: [],
  },
  {
    name: "Johan Hjort",
    role: "Produktion / Orderhantering",
    bio: [
      "Johan har varit med oss sedan 2008 och jobbar med både orderhantering och till viss del produktion. Med sin stora kundkännedom är han den i företaget som kan alla kundspecifika krav som ett rinnande vatten.",
      "Johan stöttar även upp som ordermottagare vid behov, vilket är otroligt mycket värt för Skylt & Gravyrteknik.",
    ],
    contacts: [],
  },
];

export const CONTACT = {
  eyebrow: "Kontakt",
  title: "Hör av dig",
  lead: "Vi gillar när det är bråttom. Ring eller mejla, så återkommer vi snabbt.",
  phone: "Telefon",
  email: "E-post",
  visit: "Besök & post",
  hours: "Öppettider & upphämtning",
  place: "Högsbo (verkstad & butik)",
  directions: "Vägbeskrivning",
  pickup: "Vill du hämta din order väljer du Hämta i Högsbo i kassan.",
  peopleTitle: "Direkt till rätt person",
  companyTitle: "Företaget",
} as const;
