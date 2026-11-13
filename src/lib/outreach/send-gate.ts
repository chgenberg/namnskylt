import type { CompanyProfile } from "../company/profile";
import { emailDomain, normalizeEmail, type ControlMode, type Country, type LeadStatus, type Wave } from "./model";

/** Allt som måste stämma innan ett lead får godkännas eller ett mejl skickas. */

export const BLOCKER_LABELS = {
  "sender-legal-name": "Avsändarens juridiska namn saknas i företagsprofilen",
  "sender-org-number": "Avsändarens org.nr saknas i företagsprofilen",
  "sender-address": "Avsändarens postadress saknas i företagsprofilen",
  "from-domain": "Avsändaradressen ligger inte på sändningsdomänen",
  "reply-to": "Svarsadressen saknas eller ligger på sändningsdomänen",
  "lead-blocked": "Leadet är spärrat vid importen",
  suppressed: "Adressen har avregistrerats eller spärrats",
  "not-allowlisted": "Adressen finns inte i allowlist",
  "country-locked": "Bara svenska mottagare får utskick just nu",
  "wave-missing": "Leadet saknar våg",
  "wave-not-open": "Vågen är inte öppen i uppvärmningen än",
  "shop-missing": "Demobutiken är inte förberedd",
  "hero-missing": "Den personliga skylten är inte renderad",
  "supplier-not-configured": "Leverantörens API är inte konfigurerat, så en order skulle bli en mock",
} as const;

export type BlockerCode = keyof typeof BLOCKER_LABELS;

export interface GateLead {
  email: string;
  country: Country;
  wave: Wave | null;
  status: LeadStatus;
  shopSlug: string | null;
}

export interface GateContext {
  company: Pick<CompanyProfile, "name" | "orgNumber" | "address">;
  campaign: { fromEmail: string; replyTo: string };
  sendingDomain: string;
  suppressed: boolean;
  /** `null` = ingen allowlist satt. */
  allowlist: ReadonlySet<string> | null;
  mode: ControlMode;
  supplierConfigured: boolean;
  heroReady: boolean;
  /** Vågor som uppvärmningen släpper fram; utelämnat vid godkännande. */
  openWaves?: readonly Wave[];
}

const onDomain = (email: string, domain: string) => {
  const host = emailDomain(email);
  return host === domain || host.endsWith(`.${domain}`);
};

type Rule = readonly [hit: boolean, code: BlockerCode];

const hits = (rules: readonly Rule[]): BlockerCode[] => rules.filter(([hit]) => hit).map(([, code]) => code);

export function senderBlockers(ctx: GateContext): BlockerCode[] {
  const domain = ctx.sendingDomain.trim().toLowerCase();
  const replyTo = ctx.campaign.replyTo.trim();
  return hits([
    [!ctx.company.name.trim(), "sender-legal-name"],
    [!ctx.company.orgNumber.trim(), "sender-org-number"],
    [!ctx.company.address.trim(), "sender-address"],
    [!domain || emailDomain(ctx.campaign.fromEmail) !== domain, "from-domain"],
    [!replyTo || (domain !== "" && onDomain(replyTo, domain)), "reply-to"],
  ]);
}

export function outreachBlockers(lead: GateLead, ctx: GateContext): BlockerCode[] {
  const email = normalizeEmail(lead.email);
  const waveClosed = lead.wave !== null && ctx.openWaves !== undefined && !ctx.openWaves.includes(lead.wave);
  return [
    ...senderBlockers(ctx),
    ...hits([
      [lead.status === "blocked" || lead.status === "suppressed", "lead-blocked"],
      [ctx.suppressed, "suppressed"],
      [ctx.allowlist !== null && !ctx.allowlist.has(email), "not-allowlisted"],
      [lead.country !== "se", "country-locked"],
      [lead.wave === null, "wave-missing"],
      [waveClosed, "wave-not-open"],
      [!lead.shopSlug, "shop-missing"],
      [!ctx.heroReady, "hero-missing"],
      [ctx.mode === "live" && !ctx.supplierConfigured, "supplier-not-configured"],
    ]),
  ];
}

/** Det som gör ett lead omöjligt att godkänna. Avsändare, våg och allowlist prövas först vid sändning. */
const APPROVAL_BLOCKERS: readonly BlockerCode[] = [
  "lead-blocked",
  "suppressed",
  "country-locked",
  "wave-missing",
  "shop-missing",
  "hero-missing",
];

export function approvalBlockers(lead: GateLead, ctx: Pick<GateContext, "suppressed" | "heroReady">): BlockerCode[] {
  const all = outreachBlockers(lead, {
    company: { name: "-", orgNumber: "-", address: "-" },
    campaign: { fromEmail: "a@x", replyTo: "b@y" },
    sendingDomain: "x",
    allowlist: null,
    mode: "dry_run",
    supplierConfigured: true,
    ...ctx,
  });
  return all.filter((code) => APPROVAL_BLOCKERS.includes(code));
}

/** `OUTREACH_ALLOWLIST` är kommaseparerad; tom betyder ingen allowlist. */
export function parseAllowlist(value: string | undefined): ReadonlySet<string> | null {
  const emails = (value ?? "")
    .split(/[,;\s]+/)
    .map((e) => normalizeEmail(e))
    .filter(Boolean);
  return emails.length ? new Set(emails) : null;
}
