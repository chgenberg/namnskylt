import { getMaterial, type BadgeDocument } from "@/engine";

export interface ProducerSplit {
  /** Tillverkas av Skylt & Gravyrteknik och skickas till deras API. */
  workshop: BadgeDocument[];
  /** Quickbuttons material — ingen integration, blir en förfrågan som bekräftas via e-post. */
  partner: BadgeDocument[];
}

export function splitByProducer(badges: readonly BadgeDocument[]): ProducerSplit {
  const split: ProducerSplit = { workshop: [], partner: [] };
  for (const badge of badges) {
    const producer = getMaterial(badge.materialId).producer;
    split[producer === "quickbutton" ? "partner" : "workshop"].push(badge);
  }
  return split;
}

export function partnerRequestNumber(now: number = Date.now()): string {
  return `QB-${now.toString(36).toUpperCase()}`;
}
