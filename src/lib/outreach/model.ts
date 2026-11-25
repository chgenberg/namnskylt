import { z } from "zod";

/**
 * Domänmodellen för återförsäljarutskicket. Statuslistorna här och
 * `check`-villkoren i migreringen `013_outreach` måste vara samma — ett test låser det.
 */

export const LEAD_STATUSES = [
  "draft",
  "blocked",
  "approved",
  "in_sequence",
  "completed",
  "converted",
  "suppressed",
  "expired",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const MESSAGE_STATUSES = [
  "scheduled",
  "ready",
  "sending",
  "sent",
  "delivered",
  "bounced",
  "complained",
  "failed",
  "needs_review",
  "cancelled",
  "skipped",
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const STOP_REASONS = ["landed", "replied", "activated", "unsubscribed", "bounced", "complained", "manual"] as const;
export type StopReason = (typeof STOP_REASONS)[number];

export const SUPPRESSION_REASONS = ["unsubscribe", "bounce", "complaint", "manual", "erasure"] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

export const SUPPRESSION_SOURCES = ["link", "one_click", "webhook", "operator", "import"] as const;
export type SuppressionSource = (typeof SUPPRESSION_SOURCES)[number];

export const WAVES = ["internal", "A", "B", "C", "NO"] as const;
export type Wave = (typeof WAVES)[number];

export const COUNTRIES = ["se", "no", "ax"] as const;
export type Country = (typeof COUNTRIES)[number];

export const CAMPAIGN_STATUSES = ["draft", "active", "paused", "done"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CONTROL_MODES = ["dry_run", "live"] as const;
export type ControlMode = (typeof CONTROL_MODES)[number];

/** Relationen till oss styr budskapet — härleds ur listan, lagras inte. */
export const RELATION_SEGMENTS = ["activated-known", "activated-unknown", "inactive-known", "inactive-unknown"] as const;
export type RelationSegment = (typeof RELATION_SEGMENTS)[number];

export function relationSegment(lead: { activated: boolean; known: boolean }): RelationSegment {
  if (lead.activated) return lead.known ? "activated-known" : "activated-unknown";
  return lead.known ? "inactive-known" : "inactive-unknown";
}

export const RELATION_SEGMENT_LABELS: Record<RelationSegment, string> = {
  "activated-known": "Aktiverat oss, kända",
  "activated-unknown": "Aktiverat oss, ej kända",
  "inactive-known": "Ej aktiverat oss, kända",
  "inactive-unknown": "Ej aktiverat oss, ej kända",
};

const MESSAGE_TRANSITIONS: Record<MessageStatus, readonly MessageStatus[]> = {
  scheduled: ["ready", "cancelled"],
  ready: ["sending", "cancelled", "skipped"],
  sending: ["sent", "failed", "needs_review", "ready"],
  sent: ["delivered", "bounced", "complained"],
  delivered: ["bounced", "complained"],
  failed: ["ready", "needs_review", "cancelled"],
  bounced: [],
  complained: [],
  needs_review: [],
  cancelled: [],
  skipped: [],
};

export function canTransitionMessage(from: MessageStatus, to: MessageStatus): boolean {
  return MESSAGE_TRANSITIONS[from].includes(to);
}

export function idempotencyKey(campaignId: string, leadId: string, step: number): string {
  return `outreach:${campaignId}:${leadId}:${step}`;
}

/** Personbilden granskas av en människa innan den får följa med i ett mejl. */
export const ASSET_REVIEWS = ["pending", "approved", "rejected"] as const;
export type AssetReview = (typeof ASSET_REVIEWS)[number];

/** Förnamnet ur ett kontaktnamn; `null` för adresser och enstaka bokstäver. */
/**
 * Ord som står i kundlistans kontaktfält men inte är ett namn: en roll, en avdelning eller en företagsform.
 * Mejlet hälsar då bara "Hej!" (besked av ägaren 2026-11-25: "det får inte bli 'hej info'").
 */
const NOT_A_NAME =
  /^(info|information|ekonomi|order|ordrar|kontakt|admin|administration|inköp|inkop|försälj|forsalj|sälj|salj|sales|reception|kansli|butik|lager|service|support|vd|ab|hb|kb|firma|post|mail|e-post|epost|kund|marknad|faktur|kontor|office|hello|hej|team|personal|redovisning|bokför|bokfor|växel|vaxel|produktion|tryck|reklam|studio|beställ|bestall|ingen|okänd|okand|vet)/i;

/** «ANNA» och «anna» blir «Anna», «ANN-SOFIE» blir «Ann-Sofie». Ett namn med blandade versaler står kvar. */
function nameCase(word: string): string {
  if (word !== word.toLocaleUpperCase("sv") && word !== word.toLocaleLowerCase("sv")) return word;
  return word
    .split("-")
    .map((part) => (part ? part.charAt(0).toLocaleUpperCase("sv") + part.slice(1).toLocaleLowerCase("sv") : part))
    .join("-");
}

/** Förnamnet att hälsa med, eller `null` när kontaktfältet inte börjar med ett namn. */
export function firstNameOf(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  if (!first || first.length < 2 || first.includes("@")) return null;
  if (/[\d&.,()/_+:;"!?<>]/.test(first) || NOT_A_NAME.test(first)) return null;
  return nameCase(first);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmailLike(value: string): boolean {
  return EMAIL.test(value.trim());
}

export function emailDomain(email: string): string {
  return normalizeEmail(email).split("@")[1] ?? "";
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Varumärkesdata på leadet. Loggan som data-URL hör hemma i butiken, inte här. */
export const outreachBrandSchema = z.object({
  logoUrl: z
    .url()
    .refine((url) => !url.startsWith("data:"), "Loggan ska vara en adress, inte en data-URL")
    .nullable(),
  colors: z.array(z.string().regex(HEX_COLOR)).max(8),
  industry: z.string().trim().max(80).nullable(),
  /** Miljön där personalen bär skyltar, ur hemsidan; styr personbilden. */
  workplace: z.string().trim().max(240).nullable().optional(),
  scrapedFrom: z.string().trim().max(200).nullable(),
  scrapedAt: z.iso.datetime().nullable(),
});
export type OutreachBrand = z.infer<typeof outreachBrandSchema>;

export interface CampaignStep {
  step: number;
  delayBusinessDays: number;
  template: "intro" | "reminder";
  enabled: boolean;
}

export const campaignStepSchema = z.object({
  step: z.number().int().min(1).max(5),
  delayBusinessDays: z.number().int().min(0).max(30),
  template: z.enum(["intro", "reminder"]),
  enabled: z.boolean(),
}) satisfies z.ZodType<CampaignStep, unknown>;

/** Påminnelsen ligger avstängd tills beslutet om den är taget. */
export const DEFAULT_CAMPAIGN_STEPS: readonly CampaignStep[] = [
  { step: 1, delayBusinessDays: 0, template: "intro", enabled: true },
  { step: 2, delayBusinessDays: 5, template: "reminder", enabled: false },
];
