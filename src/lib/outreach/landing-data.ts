import "server-only";
import { db } from "@/lib/db/client";
import type { Shop } from "@/lib/shops/model";
import { getShop } from "@/lib/shops/repository";
import { tileLabel } from "./badge-asset";
import { landingMessageId } from "./landing";
import { linkSecrets } from "./link-token";
import { approvedPersona, assetsForLead, getLead, getMessage, type AssetMeta, type LeadRow } from "./store";

export interface LandingTile extends AssetMeta {
  label: string;
}

export interface LandingData {
  messageId: string;
  lead: LeadRow;
  shop: Shop;
  hero: AssetMeta;
  /** Bilden från mejlet, om en gjordes. */
  persona: AssetMeta | null;
  tiles: LandingTile[];
}

/** Allt landningssidan visar, eller `null` för en länk som inte gäller (samma svar oavsett varför). */
export async function loadLanding(token: string): Promise<LandingData | null> {
  const messageId = landingMessageId(token, linkSecrets(), new Date());
  const sql = db();
  if (!messageId || !sql) return null;
  const message = await getMessage(sql, messageId);
  const lead = message ? await getLead(sql, message.leadId) : null;
  if (!lead?.shopSlug || lead.status === "suppressed") return null;
  const [shop, assets] = await Promise.all([getShop(lead.shopSlug), assetsForLead(sql, lead.id)]);
  const hero = assets.find((a) => a.kind === "hero");
  if (!shop || !hero) return null;
  const tiles = assets
    .filter((a) => a.kind === "tile")
    .map((a) => ({ ...a, label: tileLabel(a) }));
  const persona = approvedPersona(assets);
  return { messageId, lead, shop, hero, persona, tiles };
}
