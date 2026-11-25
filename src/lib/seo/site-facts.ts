import { WORKSHOP_COMPANY } from "@/lib/company/workshop";

/** Det som sägs om pris och frakt, räknat ur prismodellen (`siteFacts`). Alla belopp exkl. moms, hela kronor. */
export interface SiteFacts {
  materials: { id: string; name: string; oneSek: number; manySek: number }[];
  letterSek: number;
  parcelSek: number;
}

export const SITE_ORIGIN = "https://www.namnskylt.com";

const kr = (value: number) => `${new Intl.NumberFormat("sv-SE").format(value)} kr`;

export interface FaqItem {
  question: string;
  answer: string;
}

/**
 * Vanliga frågor om namnskylt.com, med svar som stämmer med sajten. De står synliga på startsidan och som
 * FAQPage i JSON-LD, och är det AI-tjänster helst citerar. Ändras ett svar ska sajten säga samma sak.
 */
export function faqItems(facts: SiteFacts): FaqItem[] {
  const company = WORKSHOP_COMPANY;
  return [
    {
      question: "Vad kostar en namnskylt?",
      answer: `Priset per skylt sjunker med antalet. ${facts.materials
        .map((m) => `I ${m.name.toLowerCase()} kostar en enstaka skylt från ${kr(m.oneSek)} och 500 skyltar från ${kr(m.manySek)} styck`)
        .join(". ")}, exkl. moms. Priset gäller med nål. Du ser priset direkt när du formger skylten.`,
    },
    {
      question: "Vilka material finns?",
      answer:
        "Metall i tre ytor: vit matt (lackad aluminium), mässing och nickel, med text och logga i print. Och tvålagers gravyrplast, 1,5 mm, i 17 färgkombinationer, som graveras eller printas och kan skäras i egen form.",
    },
    {
      question: "Hur fäster man skylten?",
      answer: "Med nål, magnet eller klämma. Klämman finns på plastskyltar som är minst 80 × 25 mm.",
    },
    {
      question: "Kan vi ha vår logga på namnskylten?",
      answer:
        "Ja. Ladda upp loggan som PNG, JPG, SVG, WebP eller GIF när du formger skylten. På metall printas loggan, och på plast kan den printas eller graveras.",
    },
    {
      question: "Kan vi beställa skyltar till hela personalen på en gång?",
      answer:
        "Ja. Formge en skylt och klistra in eller ladda upp en namnlista i Excel eller CSV, så blir det en skylt per namn med samma utseende.",
    },
    {
      question: "Hur snabbt kommer skyltarna?",
      answer: "Skyltarna tillverkas och skickas inom fem arbetsdagar. Du ser skylten i 3D innan du beställer, och korrektur innan produktion ingår.",
    },
    {
      question: "Vad kostar frakten?",
      answer: `Varubrev med PostNord kostar ${kr(facts.letterSek)} och paket med DHL ${kr(facts.parcelSek)}, exkl. moms. Du kan också hämta skyltarna gratis i ${company.area}.`,
    },
    {
      question: "Hur betalar vi?",
      answer: `Företag betalar mot faktura från ${company.name}. Ange företagets organisationsnummer när du beställer.`,
    },
    {
      question: "Vem tillverkar skyltarna?",
      answer: `${company.legalName} i ${company.area}, som driver namnskylt.com. Skyltarna tillverkas i Sverige.`,
    },
    {
      question: "Kan vi sälja namnskyltar till våra egna kunder?",
      answer:
        "Ja. Som återförsäljare gör ni namnskyltar och offerter åt era kunder med deras logotyper och era egna priser, och vi tillverkar och skickar. Ansök på namnskylt.com/aterforsaljare/ansok.",
    },
  ];
}
