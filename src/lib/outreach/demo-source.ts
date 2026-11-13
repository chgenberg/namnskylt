/** Var en lead-butik hämtar sitt utseende. Rena funktioner — prepare-demo gör nätet och databasen. */

export type DemoSource = { kind: "website"; url: string; host: string } | { kind: "shell" };

/** `https://www.Profilab.se/` → `profilab.se`; samma form som `shops.data.sourceUrl`. */
export function sourceHost(url: string): string | null {
  try {
    const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

export function pickDemoSource(lead: { website: string | null }): DemoSource {
  const host = lead.website ? sourceHost(lead.website) : null;
  return host ? { kind: "website", url: `https://${host}`, host } : { kind: "shell" };
}

/**
 * Leads med samma webbplats i en grupp, i listans ordning. Grupperna kan köras
 * parallellt; inom en grupp måste de gå i tur så att butiken byggs en gång.
 */
export function groupByWebsite<T extends { id: string; website: string | null }>(leads: readonly T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const lead of leads) {
    const key = (lead.website && sourceHost(lead.website)) ?? lead.id;
    groups.set(key, [...(groups.get(key) ?? []), lead]);
  }
  return [...groups.values()];
}

/** En butik utan ägare som skapats för ett utskick: man kan prova den men inte beställa. */
export function isOutreachPreviewShop(shop: { ownerId: string | null; hasOutreachLead: boolean }): boolean {
  return shop.ownerId === null && shop.hasOutreachLead;
}

export const OUTREACH_PREVIEW_ORDER_ERROR = "Butiken är en förhandsvisning — aktivera den för att ta emot beställningar.";
