/** Kontaktuppgifter ur en hemsidas HTML. Strukturerad data först, sedan länkar, sist löptext. */
export interface FoundContacts {
  email: string | null;
  phone: string | null;
  orgNumber: string | null;
  address: string | null;
}

const IGNORED_EMAIL = /\.(png|jpe?g|gif|svg|webp)$|@(example|sentry|wixpress|domain)\./i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?:\+46|0046|\b0)\s?\(?0?\)?\d{1,3}(?:[\s-]?\d{2,3}){2,3}\b/g;
const LABELLED_ORG = /org(?:anisations)?\.?\s?(?:nr|nummer)\.?\s*:?\s*(\d{6}-?\d{4})/i;
const ORG = /\b(\d{6}-\d{4})\b/g;
const POSTAL_ADDRESS =
  /([A-ZÅÄÖ][A-Za-zÅÄÖåäöéü.\- ]{2,40}?\s\d{1,4}\s?[A-Za-z]?)\s*[,|·]?\s+(\d{3}\s?\d{2})\s+([A-ZÅÄÖ][a-zåäöéü]+(?:[\s-][A-ZÅÄÖ][a-zåäöéü]+)?)/;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function pageText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|address|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|[a-z]+);/gi, (_, e: string) =>
      e.startsWith("#") ? String.fromCharCode(Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? " "),
    )
    .replace(/[ \t\u00a0]+/g, " ");
}

function formatPhone(raw: string): string {
  return raw
    .replace(/^0046/, "+46")
    .replace(/^\+46\s*\(0\)\s*/, "+46 ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Svenska org.nr har tredje siffran 2 eller högre — annars är det ett personnummer. */
function isCompanyOrgNumber(value: string): boolean {
  const digits = value.replace("-", "");
  return digits.length === 10 && Number(digits[2]) >= 2;
}

const withDash = (value: string) => (value.includes("-") ? value : `${value.slice(0, 6)}-${value.slice(6)}`);

interface LdContacts {
  email?: string;
  telephone?: string;
  vatID?: string;
  taxID?: string;
  address?: { streetAddress?: string; postalCode?: string; addressLocality?: string } | string;
}

function ldNodes(html: string): LdContacts[] {
  const nodes: LdContacts[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if ("telephone" in record || "email" in record || "address" in record) nodes.push(record as LdContacts);
    if ("@graph" in record) visit(record["@graph"]);
  };
  for (const match of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(match[1] ?? ""));
    } catch {
      // Trasig JSON-LD är vanligt — då får löptexten räcka.
    }
  }
  return nodes;
}

function ldAddress(node: LdContacts): string | null {
  const a = node.address;
  if (!a) return null;
  if (typeof a === "string") return a.trim() || null;
  const city = [a.postalCode, a.addressLocality].filter(Boolean).join(" ");
  return [a.streetAddress, city].filter(Boolean).join("\n") || null;
}

export function extractContacts(html: string): FoundContacts {
  const ld = ldNodes(html);
  const text = pageText(html);

  const mailto = [...html.matchAll(/href=["']mailto:([^"'?]+)/gi)].map((m) => decodeURIComponent(m[1] ?? ""));
  const emails = [...ld.map((n) => n.email ?? ""), ...mailto, ...(text.match(EMAIL) ?? [])]
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e && !IGNORED_EMAIL.test(e));

  const tel = [...html.matchAll(/href=["']tel:([^"']+)/gi)].map((m) => decodeURIComponent(m[1] ?? ""));
  const phones = [...ld.map((n) => n.telephone ?? ""), ...tel, ...(text.match(PHONE) ?? [])]
    .map(formatPhone)
    .filter((p) => p.replace(/\D/g, "").length >= 8);

  const ldOrg = ld.map((n) => (n.vatID ?? n.taxID ?? "").replace(/^SE|01$/g, "").replace(/\D/g, "")).find(isCompanyOrgNumber);
  const labelled = text.match(LABELLED_ORG)?.[1];
  const loose = [...text.matchAll(ORG)].map((m) => m[1] ?? "").find(isCompanyOrgNumber);
  const org = [ldOrg, labelled, loose].find((v): v is string => !!v && isCompanyOrgNumber(v));

  const postal = text.match(POSTAL_ADDRESS);
  const address =
    ld.map(ldAddress).find(Boolean) ??
    (postal ? `${postal[1]?.trim()}\n${postal[2]?.replace(/(\d{3})\s?(\d{2})/, "$1 $2")} ${postal[3]}` : null);

  return {
    email: emails[0] ?? null,
    phone: phones[0] ?? null,
    orgNumber: org ? withDash(org) : null,
    address,
  };
}

/** Första hittade värdet per fält — startsidan först, kontaktsidan fyller luckorna. */
export function mergeContacts(...found: FoundContacts[]): FoundContacts {
  const pick = (key: keyof FoundContacts) => found.map((f) => f[key]).find((v) => v) ?? null;
  return { email: pick("email"), phone: pick("phone"), orgNumber: pick("orgNumber"), address: pick("address") };
}
