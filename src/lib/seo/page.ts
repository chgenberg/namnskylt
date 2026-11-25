import type { Metadata } from "next";
import { OG_IMAGE } from "./og";
import { SITE_ORIGIN } from "./site-facts";

/**
 * En publik sida på namnskylt.com som sökmotorer ska hitta (2026-11-25). Samma uppgifter ger sidans
 * metadata (titel, beskrivning, kanonisk adress, delningskort) och dess JSON-LD, så att de aldrig säger
 * olika saker.
 */
export interface SitePage {
  path: string;
  /** Sidans namn, som i menyn. Titeln i fliken blir "Namn · namnskylt.com". Utelämnas på startsidan. */
  title?: string;
  /** Hela titeln, utan sajtens namn efter, när sidan ska ha en egen (startsidan). */
  absoluteTitle?: string;
  /** Det sökresultatet visar under titeln: helst 120–160 tecken. */
  description: string;
}

export const SITE_NAME = "namnskylt.com";

/** Sajtens publika sidor, i menyns ordning. Sidorna, sitemapen och `/llms.txt` läser härifrån. */
export const SITE_PAGES = {
  home: {
    path: "/",
    absoluteTitle: "Namnskyltar med logga i metall och plast · namnskylt.com",
    description:
      "Namnskyltar med namn och logga, i metall eller plast. Se skylten i 3D, välj nål, magnet eller klämma. Tillverkas i Göteborg av Skylt & Gravyrteknik.",
  },
  skapa: {
    path: "/skapa",
    title: "Skapa namnskylt",
    description:
      "Formge din namnskylt i 3D: material, färg, form, text, logga och fäste. Priset per skylt syns direkt medan du väljer.",
  },
  foretag: {
    path: "/foretag",
    title: "Namnskyltar för företag",
    description:
      "Namnskyltar till hela teamet. Formge en skylt, klistra in listan med namn och få lägre pris per skylt ju fler ni beställer. Faktura för företag.",
  },
  inspiration: {
    path: "/inspiration",
    title: "Inspirationsbank",
    description:
      "Åtta namnskyltar i metall och plast, med närbilder på valen: ytan, formen och fästet. Gör en liknande skylt med ett klick.",
  },
  omOss: {
    path: "/om-oss",
    title: "Om oss",
    description:
      "namnskylt.com är Skylt & Gravyrtekniks sajt för namnskyltar. Vi gör skyltarna i vår produktion i Göteborg och levererar till hela Sverige.",
  },
  kontakt: {
    path: "/kontakt",
    title: "Kontakta oss",
    description: "Ring eller mejla Skylt & Gravyrteknik, som driver namnskylt.com: telefon, e-post, adress och öppettider i Högsbo, Göteborg.",
  },
  villkor: {
    path: "/villkor",
    title: "Köpvillkor",
    description: "Skylt & Gravyrtekniks köpvillkor, som gäller när du beställer namnskyltar på namnskylt.com.",
  },
  integritet: {
    path: "/integritet",
    title: "Integritetspolicy",
    description: "Skylt & Gravyrteknik driver namnskylt.com och ansvarar för personuppgifterna när du beställer här.",
  },
} as const satisfies Record<string, SitePage>;

/** Titeln som den står i fliken och i sökresultatet. */
export function pageTitle(page: SitePage): string {
  return page.absoluteTitle ?? (page.title ? `${page.title} · ${SITE_NAME}` : SITE_NAME);
}

export function pageUrl(page: Pick<SitePage, "path">): string {
  return page.path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${page.path}`;
}

/** Metadata för en publik sida. Delningskortet får sidans egen titel och beskrivning, och sajtens bild. */
export function pageMetadata(page: SitePage): Metadata {
  const title = pageTitle(page);
  const image = { url: OG_IMAGE.src, width: OG_IMAGE.width, height: OG_IMAGE.height, alt: OG_IMAGE.alt };
  return {
    title: page.absoluteTitle ? { absolute: page.absoluteTitle } : page.title,
    description: page.description,
    alternates: { canonical: page.path },
    openGraph: {
      title,
      description: page.description,
      url: page.path,
      siteName: SITE_NAME,
      locale: "sv_SE",
      type: "website",
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description: page.description, images: [OG_IMAGE.src] },
  };
}
