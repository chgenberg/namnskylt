import type { MaterialId, MountingId } from "@/engine";

export interface Scene {
  time: string;
  place: string;
  title: string;
  body: readonly string[];
}

export interface Workplace {
  title: string;
  body: string;
  badge: { texts: [string, string]; materialId: MaterialId; colorId: string; mounting?: MountingId };
}

export const HERO = {
  eyebrow: "För företag",
  title: "Hej, jag heter Sara.",
  lead: "Det är första meningen i nästan varje möte. En namnskylt säger den åt er, hela dagen, till alla som kommer in genom dörren.",
  primary: "Gör skyltar till teamet",
  secondary: "Rabatt för fler",
} as const;

export const STORY_INTRO = {
  eyebrow: "En vanlig vecka",
  title: "Fyra små ögonblick där ett namn gör skillnad",
} as const;

export const SCENES: readonly Scene[] = [
  {
    time: "Måndag 08.12",
    place: "Första dagen",
    title: "Ingen minns tolv namn efter en presentationsrunda.",
    body: [
      "Den nya kollegan har hälsat på halva kontoret innan kaffet ens är klart. Efter lunch står hon vid skrivaren och vet att mannen bredvid heter något på J. Johan? Jonas? Hon frågar inte. Det känns för sent att fråga nu.",
      "Med en skylt slipper hon gissa, och han slipper känna sig bortglömd. Det låter som en småsak. Men det är ofta småsakerna som avgör om första veckan känns välkomnande eller lite ensam.",
    ],
  },
  {
    time: "Tisdag 14.40",
    place: "I butiken",
    title: "Det är lättare att fråga Sara än att fråga någon.",
    body: [
      "En kund letar efter en storlek som inte finns på hyllan. Tre personer står i samma tröja och hon vet inte vem som jobbar där och vem som också letar. När hon väl hittar rätt person börjar hon med ”ursäkta”.",
      "Står det Sara på tröjan blir det ett annat samtal. Kunden säger tack, Sara. Sara känner sig sedd. Och nästa gång vet kunden vem hon ska leta efter.",
    ],
  },
  {
    time: "Onsdag 03.15",
    place: "På avdelningen",
    title: "Mitt i natten vill man veta vem som står vid sängen.",
    body: [
      "Den som ligger på sjukhus träffar många nya ansikten på kort tid, ofta i samma kläder och ofta i ett tempo som inte lämnar plats för presentationer. Är det läkaren? Undersköterskan? Någon från labbet?",
      "Namnet på första raden och yrket på den andra gör det lättare att ställa rätt fråga till rätt person. Och personalen blir oftare kallad vid sitt namn i stället för ”syster”.",
    ],
  },
  {
    time: "Fredag 16.55",
    place: "Inför helgen",
    title: "En skylt säger något om hur ni ser på varandra.",
    body: [
      "Vi har alla sett den handskrivna lappen i en plastficka, med blekt bläck och ett hörn som vikt sig. Den fungerar. Men den säger också att det här var en efterhandstanke.",
      "En graverad skylt i samma typsnitt och färg för hela teamet säger motsatsen: här är vi ett lag, och det är värt att göra ordentligt. Texten är graverad i materialet, så den nöts inte bort som tryck gör.",
    ],
  },
];

export const QUOTE = "Det är svårt att vara otrevlig mot någon man vet vad hen heter.";

export const HOW = {
  eyebrow: "Hela teamet på en gång",
  title: "Ni behöver inte göra en skylt i taget",
  steps: [
    {
      title: "Formge den första",
      body: "Välj material, färg, form och fäste på en skylt. Den blir mallen för resten.",
    },
    {
      title: "Klistra in listan",
      body: "Ett namn och en titel per rad, gärna direkt från ett kalkylark. Ni ser varje skylt innan ni beställer, och blir ett namn för långt säger vi till.",
    },
    {
      title: "Vi graverar och skickar",
      body: "Skylt & Gravyrteknik tillverkar i Sverige och skickar inom fem arbetsdagar.",
    },
  ],
} as const;

export const VOLUME = {
  title: "Ju fler ni är, desto billigare blir varje skylt",
  body: "Rabatten räknas på hela beställningen, även när alla skyltar har olika namn.",
} as const;

export const WORKPLACES_INTRO = {
  eyebrow: "Där det märks mest",
  title: "Överallt där människor möter människor",
} as const;

export const WORKPLACES: readonly Workplace[] = [
  {
    title: "Vård och omsorg",
    body: "Patienter och anhöriga ser vem de pratar med, även när alla bär samma kläder.",
    badge: { texts: ["Sara Nilsson", "Undersköterska"], materialId: "plastic-2-layer", colorId: "white-blue", mounting: "clip" },
  },
  {
    title: "Butik",
    body: "Kunden ser direkt vem som jobbar där och vem man kan fråga.",
    badge: { texts: ["Wilma Berg", "Butikssäljare"], materialId: "plastic-2-layer", colorId: "black-white", mounting: "magnet" },
  },
  {
    title: "Hotell och restaurang",
    body: "Gästen kan säga tack med namn, och det brukar man minnas.",
    badge: { texts: ["Johan Ek", "Hovmästare"], materialId: "plastic-2-layer", colorId: "gold-black", mounting: "magnet" },
  },
  {
    title: "Skola och förskola",
    body: "Nya föräldrar lär sig vem som är vem redan på första hämtningen.",
    badge: { texts: ["Elsa Lind", "Förskollärare"], materialId: "plastic-2-layer", colorId: "darkgreen-white", mounting: "safety-pin" },
  },
  {
    title: "Mässa och event",
    body: "Besökaren har läst ert namn innan ni hunnit säga hej.",
    badge: { texts: ["Ahmed Karimi", "Säljare"], materialId: "plastic-2-layer", colorId: "red-white", mounting: "safety-pin" },
  },
  {
    title: "Reception och kontor",
    body: "Första intrycket av ett företag börjar ofta vid disken.",
    badge: { texts: ["Lena Björk", "Reception"], materialId: "stainless", colorId: "steel-laser" },
  },
];

export const OUTRO = {
  title: "Börja med ett namn",
  body: "Skriv det första, så tar resten av teamet bara några minuter.",
  cta: "Skriv ett namn",
} as const;
