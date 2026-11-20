import { engravedRows, orderDesigns, type BadgeDocument } from "@/engine";
import { companyFooter } from "@/lib/company/profile";
import type { SellerProfile } from "@/lib/company/seller";
import { deliveryLines } from "@/lib/orders/delivery";
import { QUOTE_SHOT_DESIGNS, showsElement, type StoredQuote } from "./model";

/**
 * Det offerten säger, på ett ställe. PDF:en (`document.ts`) och kundens offertsida ritar båda ur
 * de här delarna, så att de visar samma uppgifter (besked via ägaren 2026-11-20: "PDF o mail visar
 * inte samma info"). Förut hade sidan en egen rubrik och bara en bild, och saknade offertdatum,
 * vinkelbilderna, rutan med alla skyltar, den avslutande texten och säljarens val av delar.
 * Lägg det som ska stå på offerten här, inte i den ena av de två.
 */

/** Löftena under summan. */
export const QUOTE_PROMISES = ["Korrektur innan produktion", "Leverans inom 5 arbetsdagar", "Svensk tillverkning"];

/** Bildtexterna under de små bilderna, i den ordning vinklarna tas (`QUOTE_SHOT_YAWS` i skyltmotorn). */
const ANGLE_LABELS = ["Framifrån", "Från sidan", "Baksidan"];

/** Så många skyltar ritas i rutan "Alla skyltar". Fler står i raderna under, och det sägs. */
const ALL_BADGES_MAX = 60;

/** Så många designer får en bild överst på offerten. */
const GALLERY_MAX = Math.max(QUOTE_SHOT_DESIGNS, 6);

/** En dag som den står på offerten: "20 november 2026". */
export const quoteDay = (iso: string) =>
  new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Stockholm" }).format(
    new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso),
  );

/** Det som står på skylten, som en rad: "Erik, tomtenisse". */
export const badgeText = (badge: BadgeDocument) =>
  engravedRows(badge)
    .map((row) => row.text.trim())
    .filter(Boolean)
    .join(", ");

/** Rubriken en offert har tills säljaren ger den ett projektnamn. Ett utkast utan kund har ingen kund att nämna. */
export function defaultQuoteTitle(quote: Pick<StoredQuote, "customer" | "noCustomer">): string {
  return quote.noCustomer ? "Namnskyltar" : `Namnskyltar till ${quote.customer.company ?? quote.customer.name}`;
}

/** Offertens rubrik, och den lilla raden över den. */
export function quoteHeading(quote: Pick<StoredQuote, "customer" | "noCustomer" | "project">): { eyebrow: string; title: string } {
  return {
    eyebrow: quote.project && !quote.noCustomer ? `Offert till ${quote.customer.company ?? quote.customer.name}` : "Offert",
    title: quote.project ?? defaultQuoteTitle(quote),
  };
}

export interface QuoteInfoRow {
  label: string;
  value: string;
  /** Fältet i skyltmotorns panel som raden leder till i förhandsvisningen. */
  field?: "customer" | "validUntil";
}

/** Rutan med kunden, leveransen och dagarna. */
export function quoteInfoRows(quote: StoredQuote, company: Pick<SellerProfile, "name">): QuoteInfoRow[] {
  const customer = quote.customer;
  const contact = [customer.name !== customer.company ? customer.name : "", customer.email, customer.phone].filter(Boolean).join(" · ");
  return [
    // Ett utkast utan kund har inga kundrader: där står bara dagarna.
    ...(quote.noCustomer ? [] : [{ label: "Kund", value: customer.company ?? customer.name, field: "customer" as const }]),
    ...(customer.orgNumber ? [{ label: "Org.nr", value: customer.orgNumber }] : []),
    // En kund som sparats med bara företagets namn har det som namn också, och ingen e-post: då finns ingen kontakt att visa.
    ...(contact ? [{ label: "Kontakt", value: contact }] : []),
    ...(customer.address ? [{ label: "Adress", value: customer.address }] : []),
    // Vart skyltarna skickas. Återförsäljarens egen adress står inte på kundens offert.
    ...(quote.delivery.to === "reseller"
      ? [{ label: "Leverans", value: `Till ${company.name}` }]
      : quote.delivery.address
        ? [{ label: "Leverans", value: deliveryLines(quote.delivery.address).join("\n") }]
        : []),
    { label: "Offertdatum", value: quoteDay(quote.sentAt ?? quote.createdAt) },
    { label: "Giltig till", value: quoteDay(quote.validUntil), field: "validUntil" as const },
  ];
}

/** En design överst på offerten: skylten som visar den, bilderna ur 3D-vyn när de finns, och raden under. */
export interface QuoteGallery {
  doc: BadgeDocument;
  /** Den stora bilden ur 3D-vyn. `null` = designen ritas som ritning. */
  main: string | null;
  angles: { src: string; label: string }[];
  note: string;
}

/** Bilderna överst, en ruta per design. Tom när säljaren har valt bort bilderna. */
export function quoteGalleries(quote: StoredQuote): QuoteGallery[] {
  if (!showsElement(quote, "pictures")) return [];
  const designs = orderDesigns(quote.badges);
  const withAngles = showsElement(quote, "angles");
  const names = quote.badges.length;
  return designs.slice(0, GALLERY_MAX).map((design, i) => {
    const shot = quote.shots?.[i] ?? null;
    // Äldre offerter har en enda stillbild, av den första designen.
    const single = !shot && i === 0 && designs.length === 1 ? quote.badgeShot : null;
    return {
      doc: design.doc,
      main: shot?.main ?? single ?? null,
      angles: shot && withAngles ? shot.angles.map((src, n) => ({ src, label: ANGLE_LABELS[n] ?? "" })) : [],
      note: designs.length > 1 ? `Design ${i + 1} · ${design.count} st` : names > 1 ? `Visas med första namnet — alla ${names} namn står nedan` : "",
    };
  });
}

/**
 * Alla skyltar, en ritning per namn (besked av ägaren 2026-11-19: "vill att alla skyltar ska synas på
 * offerten"). Bilderna överst visar en skylt per design, så rutan behövs när en design har flera namn.
 * `null` när den inte behövs, eller när säljaren har valt bort den.
 */
export function quoteAllBadges(quote: StoredQuote): { badges: BadgeDocument[]; more: number } | null {
  if (!showsElement(quote, "badges") || quote.badges.length <= orderDesigns(quote.badges).length) return null;
  return { badges: quote.badges.slice(0, ALL_BADGES_MAX), more: Math.max(0, quote.badges.length - ALL_BADGES_MAX) };
}

/** Bildtexten under en skylt i rutan "Alla skyltar". */
export const allBadgesCaption = (badge: BadgeDocument) => `${badgeText(badge) || "Utan text"}${badge.quantity > 1 ? ` · ${badge.quantity} st` : ""}`;

/** Raden under rutan när alla skyltar inte ryms i den. */
export const allBadgesMore = (more: number) => `Och ${more} skyltar till. Alla står i raderna nedan.`;

/** Villkoren längst ner: hur länge offerten gäller, och säljarens egna villkor. Tom när säljaren har valt bort dem. */
export function quoteTermsLines(quote: StoredQuote, company: Pick<SellerProfile, "quoteTerms">): string[] {
  if (!showsElement(quote, "terms")) return [];
  return [`Offerten gäller till ${quoteDay(quote.validUntil)}.`, ...(company.quoteTerms ? [company.quoteTerms] : [])];
}

/** Säljarens uppgifter längst ner. Tom när säljaren har valt bort dem. */
export function quoteSellerLines(quote: StoredQuote, company: SellerProfile): string[] {
  return showsElement(quote, "seller") ? companyFooter(company) : [];
}
