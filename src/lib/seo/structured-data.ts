import { WORKSHOP_COMPANY } from "@/lib/company/workshop";
import { pageTitle, pageUrl, type SitePage } from "./page";
import { faqItems, SITE_ORIGIN, type FaqItem, type SiteFacts } from "./site-facts";

/**
 * Strukturerad data (JSON-LD, schema.org) för namnskylt.com (2026-11-25): vem som står bakom sajten, butiken i
 * Högsbo, namnskylten som produkt, brödsmulor och vanliga frågor. Google läser den för sökresultaten, och
 * AI-tjänster för att förstå vad sajten är. Bara sådant som sajten själv säger står här.
 */

type Json = Record<string, unknown>;

const company = WORKSHOP_COMPANY;
export const ORGANIZATION_ID = `${SITE_ORIGIN}/#organisation`;
export const WORKSHOP_ID = `${company.site}/#foretag`;
export const WEBSITE_ID = `${SITE_ORIGIN}/#webbplats`;

const address = {
  "@type": "PostalAddress",
  streetAddress: company.street,
  postalCode: company.zipCity.split(" ").slice(0, 2).join(" "),
  addressLocality: company.zipCity.split(" ").slice(2).join(" "),
  addressRegion: "Västra Götalands län",
  addressCountry: "SE",
};

/** Skylt & Gravyrteknik, som driver sajten, tillverkar och fakturerar. */
export function workshopOrganization(): Json {
  return {
    "@type": ["Organization", "LocalBusiness"],
    "@id": WORKSHOP_ID,
    name: company.name,
    legalName: company.legalName,
    url: company.site,
    telephone: company.phoneHref,
    email: company.email,
    address,
    identifier: { "@type": "PropertyValue", propertyID: "Organisationsnummer", value: company.orgNumber },
    areaServed: { "@type": "Country", name: "Sverige" },
    openingHoursSpecification: [
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday"], opens: "08:00", closes: "17:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: "Friday", opens: "08:00", closes: "16:00" },
    ],
  };
}

/** namnskylt.com: varumärket och sajten, en del av Skylt & Gravyrteknik. */
export function siteOrganization(): Json {
  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: "namnskylt.com",
    url: `${SITE_ORIGIN}/`,
    logo: `${SITE_ORIGIN}/logo-namnskylt.png`,
    description:
      "namnskylt.com är Skylt & Gravyrtekniks sajt för namnskyltar till företag: i metall och plast, med logga, nål, magnet eller klämma. Tillverkas i Göteborg.",
    parentOrganization: { "@id": WORKSHOP_ID },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer service",
      telephone: company.phoneHref,
      email: company.email,
      areaServed: "SE",
      availableLanguage: "sv",
    },
  };
}

export function website(): Json {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: `${SITE_ORIGIN}/`,
    name: "namnskylt.com",
    inLanguage: "sv-SE",
    publisher: { "@id": ORGANIZATION_ID },
  };
}

/** Namnskylten som produkt, en per material, med pris från–till exkl. moms. */
export function products(facts: SiteFacts): Json[] {
  const describe: Record<string, string> = {
    metal: "Namnskylt i metall: vit matt (lackad aluminium), mässing eller nickel, med namn, titel och logga i print. Nål, magnet.",
    plastic: "Namnskylt i tvålagers gravyrplast, 1,5 mm, i 17 färgkombinationer, graverad eller printad, med egen form om du vill. Nål, magnet eller klämma.",
  };
  // Exempelskyltarna på sidorna om metall och plast, ritade av motorn i format som säljs.
  const image: Record<string, string> = { metal: "/namnskyltar/metall/skylt.png", plastic: "/namnskyltar/plast/skylt.png" };
  return facts.materials.map((m) => ({
    "@type": "Product",
    "@id": `${SITE_ORIGIN}/#namnskylt-${m.id}`,
    name: `Namnskylt i ${m.name.toLowerCase()}`,
    description: describe[m.id] ?? `Namnskylt i ${m.name.toLowerCase()}.`,
    ...(image[m.id] && { image: `${SITE_ORIGIN}${image[m.id]}` }),
    category: "Namnskyltar",
    brand: { "@id": ORGANIZATION_ID },
    manufacturer: { "@id": WORKSHOP_ID },
    url: `${SITE_ORIGIN}/skapa`,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "SEK",
      lowPrice: m.manySek,
      highPrice: m.oneSek,
      availability: "https://schema.org/MadeToOrder",
      seller: { "@id": WORKSHOP_ID },
      eligibleCustomerType: "https://schema.org/Business",
      priceSpecification: { "@type": "PriceSpecification", priceCurrency: "SEK", valueAddedTaxIncluded: false },
    },
  }));
}

export function breadcrumbs(items: readonly { name: string; path: string }[]): Json {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Start", path: "/" }, ...items].map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${SITE_ORIGIN}${item.path === "/" ? "/" : item.path}`,
    })),
  };
}

/** Vanliga frågor som FAQPage: startsidans ur `faqItems`, eller en sidas egna. */
export function faqPage(source: SiteFacts | readonly FaqItem[]): Json {
  const items = Array.isArray(source) ? (source as readonly FaqItem[]) : faqItems(source as SiteFacts);
  return {
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

/** Sidan själv, som del av webbplatsen. `type` är schema.orgs sorts sida, till exempel `ContactPage`. */
export function webPage(page: SitePage, type = "WebPage", about?: string): Json {
  const url = pageUrl(page);
  return {
    "@type": type,
    "@id": `${url}#sida`,
    url,
    name: pageTitle(page),
    description: page.description,
    inLanguage: "sv-SE",
    isPartOf: { "@id": WEBSITE_ID },
    ...(about && { about: { "@id": about } }),
    ...(page.path !== "/" && { breadcrumb: { "@id": `${url}#brodsmulor` } }),
  };
}

/**
 * Sidan med brödsmulorna Start › (sidorna i `trail`) › sidan, och det som hör till sidan. `name` är sidans namn
 * i brödsmulorna när det ska vara kortare än titeln.
 */
export function pageGraph(
  page: SitePage & { title: string },
  options: { type?: string; about?: string; parts?: Json[]; trail?: { name: string; path: string }[]; name?: string } = {},
): Json {
  return graph([
    webPage(page, options.type, options.about),
    {
      ...breadcrumbs([...(options.trail ?? []), { name: options.name ?? page.title, path: page.path }]),
      "@id": `${pageUrl(page)}#brodsmulor`,
    },
    ...(options.parts ?? []),
  ]);
}

/** Ett dokument med flera delar i `@graph`, så att delarna kan peka på varandra med `@id`. */
export function graph(parts: readonly Json[]): Json {
  return { "@context": "https://schema.org", "@graph": parts };
}

/** JSON för en `<script type="application/ld+json">`: `<` skrivs som <, så att inget kan bryta ut ur taggen. */
export function jsonLdText(data: Json): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
