import { WORKSHOP_COMPANY } from "@/lib/company/workshop";
import { pageUrl, SITE_PAGES, type SitePage } from "./page";
import { faqItems, SITE_ORIGIN, type SiteFacts } from "./site-facts";

/**
 * `/llms.txt` (2026-11-25): en kort beskrivning av namnskylt.com i Markdown, enligt förslaget på llmstxt.org,
 * för AI-tjänster som ChatGPT, Claude och Perplexity. Den säger vad sajten är, vilka sidor som finns, svaren
 * på de vanliga frågorna med dagens priser, och vart man vänder sig. Inget här får säga mer än sajten gör.
 */
export function llmsText(facts: SiteFacts): string {
  const company = WORKSHOP_COMPANY;
  const pages = Object.values(SITE_PAGES) as SitePage[];
  const link = (page: SitePage) => `- [${page.title ?? "Startsidan"}](${pageUrl(page)}): ${page.description}`;
  return [
    "# namnskylt.com",
    "",
    `> namnskylt.com är ${company.name}s sajt för namnskyltar till företag i Sverige. Kunden formger skylten i 3D, med namn, titel och logga, i metall eller plast, och ${company.legalName} i ${company.area} tillverkar och skickar.`,
    "",
    `In English: namnskylt.com sells custom name badges to businesses in Sweden: metal or plastic, with name, title and logo, and a pin, magnet or clip. Made in Gothenburg by ${company.legalName}. Prices are in SEK excluding VAT.`,
    "",
    "## Sidor",
    "",
    ...pages.map(link),
    `- [Bli återförsäljare](${SITE_ORIGIN}/aterforsaljare/ansok): För reklambyråer, profilföretag och tryckerier som vill sälja namnskyltar till sina kunder med egna priser.`,
    "",
    "## Vanliga frågor",
    "",
    ...faqItems(facts).flatMap((item) => [`### ${item.question}`, "", item.answer, ""]),
    "## Kontakt",
    "",
    `- ${company.legalName}, org.nr ${company.orgNumber}`,
    `- ${company.street}, ${company.zipCity} (${company.area})`,
    `- Telefon ${company.phone}, e-post ${company.email}`,
    `- Öppettider: ${company.hours}`,
    `- ${SITE_ORIGIN}/kontakt`,
    "",
  ].join("\n");
}
