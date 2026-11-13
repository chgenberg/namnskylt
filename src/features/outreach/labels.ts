import type { AssetReview, LeadStatus, MessageStatus, Wave } from "@/lib/outreach/model";
import type { TickResult } from "@/lib/outreach/tick";

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  draft: "Utkast",
  blocked: "Spärrad vid import",
  approved: "Godkänd",
  in_sequence: "I sekvens",
  completed: "Klar",
  converted: "Aktiverad",
  suppressed: "Avregistrerad",
  expired: "Utgången",
};

export const MESSAGE_STATUS_LABEL: Record<MessageStatus, string> = {
  scheduled: "Väntar på steget före",
  ready: "Redo",
  sending: "Skickas",
  sent: "Skickat",
  delivered: "Levererat",
  bounced: "Studsade",
  complained: "Klagomål",
  failed: "Misslyckades",
  needs_review: "Behöver granskas",
  cancelled: "Avbrutet",
  skipped: "Hoppades över",
};

export const REVIEW_LABEL: Record<AssetReview, string> = {
  pending: "Att granska",
  approved: "Godkända",
  rejected: "Avvisade",
};

export const WAVE_LABEL: Record<Wave, string> = {
  internal: "Intern",
  A: "A",
  B: "B",
  C: "C",
  NO: "Norge",
};

const TICK_SKIP_LABEL: Record<NonNullable<TickResult["skipped"]>, string> = {
  disabled: "Nödstoppet OUTREACH_DISABLED är på",
  busy: "En annan tick körde redan",
  paused: "Utskicket är pausat",
  outside_window: "Utanför sändfönstret (vardagar 08:30–16:00)",
  auto_paused: "Pausades automatiskt",
  cap_reached: "Taket är nått",
  sender_incomplete: "Avsändaren är inte komplett",
  error: "Ticken kraschade",
};

export const TICK_OUTCOME_LABEL: Record<TickResult["items"][number]["outcome"], string> = {
  sent: "Skickat",
  dry_run: "Dry-run",
  skipped: "Hoppades över",
  deferred: "Väntar",
  failed: "Misslyckades",
  blocked: "Stoppat",
};

export function tickSummary(result: TickResult): string {
  if (result.skipped) return [TICK_SKIP_LABEL[result.skipped], result.reason].filter(Boolean).join(" — ");
  const mode = result.mode === "live" ? "Live" : "Dry-run";
  return `${mode}: ${result.items.length} steg behandlade`;
}
