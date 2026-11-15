/**
 * Besked till den som äger panelen när någon annan har gjort något: kunden har
 * svarat på en offert eller ett korrektur, lagt en order själv, verkstaden har
 * skickat en order, eller ett företag har ansökt om konto. Det återförsäljaren
 * gör själv ger inget besked.
 */
export const NOTICE_KINDS = [
  "quote-accepted",
  "quote-declined",
  "proof-approved",
  "proof-changes",
  "order-placed",
  "order-shipped",
  "application",
] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];

export function isNoticeKind(value: string): value is NoticeKind {
  return (NOTICE_KINDS as readonly string[]).includes(value);
}

export interface PanelNotice {
  id: string;
  kind: NoticeKind;
  /** Den som gjorde det: kundens företag eller namn, eller företaget som ansöker. */
  who: string;
  /** Kundens egna ord (skälet till ett nej, ändringen som önskas) eller en kort uppgift om ordern. */
  detail: string | null;
  quoteNo: string | null;
  orderNo: string | null;
  createdAt: string;
}

/** Det som pekar ut vilka besked en sida visar, så att de kan märkas som lästa när sidan öppnas. */
export type NoticeTarget = { orderNo: string } | { quoteNo: string } | { kind: "application" } | { all: true };

export type NoticeTone = "good" | "warn" | "info";

export interface NoticeView {
  /** En mening utan punkt: vem som gjorde vad. */
  title: string;
  detail: string | null;
  /** Sidan i panelen där beskedet hör hemma. */
  href: string;
  tone: NoticeTone;
}

/** Namnet ett besked nämner kunden vid: företaget om det finns, annars personen. */
export function customerLabel(customer: { name: string; company?: string | null }): string {
  return customer.company?.trim() || customer.name;
}

export function badgeCountLabel(count: number): string {
  return `${count} ${count === 1 ? "skylt" : "skyltar"}`;
}

/** Kundens egna ord, inom citattecken så att de inte läses som sajtens text. */
const quoted = (words: string | null) => (words?.trim() ? `”${words.trim()}”` : null);

const orderHref = (orderNo: string | null) => (orderNo ? `/admin/ordrar/${orderNo}` : "/admin/ordrar");
const quoteHref = (quoteNo: string | null) => (quoteNo ? `/admin/offerter/${quoteNo}` : "/admin/offerter");

/** Beskedet som text och länk, samma i panelen och i mejlet. */
export function noticeView(notice: PanelNotice): NoticeView {
  const quote = notice.quoteNo ? ` ${notice.quoteNo}` : "";
  switch (notice.kind) {
    case "quote-accepted":
      return {
        title: `${notice.who} har godkänt offert${quote}`,
        detail: notice.orderNo ? `Ordern ${notice.orderNo} är lagd.` : null,
        // Ordern är det som ska hanteras nu. Offerten nås därifrån.
        href: notice.orderNo ? orderHref(notice.orderNo) : quoteHref(notice.quoteNo),
        tone: "good",
      };
    case "quote-declined":
      return {
        title: `${notice.who} har tackat nej till offert${quote}`,
        detail: quoted(notice.detail),
        href: quoteHref(notice.quoteNo),
        tone: "warn",
      };
    case "proof-approved":
      return { title: `${notice.who} har godkänt sitt korrektur`, detail: null, href: orderHref(notice.orderNo), tone: "good" };
    case "proof-changes":
      return { title: `${notice.who} vill ändra i sitt korrektur`, detail: quoted(notice.detail), href: orderHref(notice.orderNo), tone: "warn" };
    case "order-placed":
      return { title: `${notice.who} har lagt en order`, detail: notice.detail, href: orderHref(notice.orderNo), tone: "info" };
    case "order-shipped":
      return {
        title: `${notice.who} har fått sin order${notice.orderNo ? ` ${notice.orderNo}` : ""} skickad från verkstaden`,
        detail: notice.detail,
        href: orderHref(notice.orderNo),
        tone: "good",
      };
    case "application":
      return {
        title: `${notice.who} har ansökt om att bli återförsäljare`,
        detail: null,
        href: "/admin/aterforsaljare",
        tone: "info",
      };
  }
}
