import "server-only";
import type { BadgeDocument } from "@/engine";
import { openai } from "@/lib/ai/openai";
import { DEFAULT_COMPANY } from "@/lib/company/profile";
import { requireDb } from "@/lib/db/client";
import { loadNodeFontEngine } from "@/lib/fonts/load-node";
import { buildShop } from "@/lib/shops/build";
import type { Shop } from "@/lib/shops/model";
import { createShop, getShop } from "@/lib/shops/repository";
import { badgeForLead, heroJpeg, newAssetId, personaBadgeName, tileChoices, tileJpeg, type LogoStatus } from "./badge-asset";
import { pickDemoSource } from "./demo-source";
import type { OutreachBrand } from "./model";
import { assetsForLead, claimLeadShop, replaceAssets, setLeadShop, shopForSource, shopHasOutreachLead, type AssetInput, type LeadRow } from "./store";
import { companyWorkplace, generatePersona, type PersonaQuality } from "./persona";
import { dataUrlBytes, traceLogoBuffer } from "./trace-logo-server";

export type PersonaOutcome = "created" | "kept" | "skipped" | "failed" | "no-ai";

export type DemoOutcome =
  | {
      ok: true;
      slug: string;
      source: "existing" | "built" | "shell";
      logoStatus: LogoStatus;
      persona: PersonaOutcome;
    }
  | { ok: false; reason: string };

export interface PrepareOptions {
  /** `keep` gör en personbild bara om den saknas; `redo` gör en ny. Varje bild kostar en bildgenerering. */
  persona?: "skip" | "keep" | "redo";
  personaQuality?: PersonaQuality;
}

const SHOP_TAKEN = "Webbplatsens butik hör redan till ett annat lead";

async function shopForLead(lead: LeadRow): Promise<{ shop: Shop; source: "existing" | "built" | "shell" } | { error: string }> {
  const sql = requireDb();
  if (lead.shopSlug) {
    const shop = await getShop(lead.shopSlug);
    if (shop) return { shop, source: "existing" };
  }
  const source = pickDemoSource(lead);
  if (source.kind === "website") {
    const existing = await shopForSource(sql, source.host);
    if (existing?.ownerId) return { error: "Har redan en egen butik" };
    if (existing && (await shopHasOutreachLead(sql, existing.slug))) {
      return { error: SHOP_TAKEN };
    }
    const shop = existing ? await getShop(existing.slug) : null;
    if (shop) return { shop, source: "existing" };
    try {
      return { shop: await buildShop(source.url, { name: lead.companyName }), source: "built" };
    } catch (error) {
      console.warn(`Hemsidan gick inte att läsa för lead ${lead.id}:`, error instanceof Error ? error.message : error);
    }
  }
  const shop = await createShop({
    profile: { ...DEFAULT_COMPANY, name: lead.companyName, website: source.kind === "website" ? source.host : "" },
    font: { family: null, google: false },
    sourceUrl: source.kind === "website" ? source.host : "",
  });
  return { shop, source: "shell" };
}

function brandOf(shop: Shop, scraped: boolean, previous: OutreachBrand | null): OutreachBrand {
  return {
    logoUrl: previous?.logoUrl ?? null,
    colors: scraped ? [shop.profile.primaryColor, shop.profile.accentColor] : (previous?.colors ?? []),
    industry: previous?.industry ?? null,
    workplace: previous?.workplace ?? null,
    scrapedFrom: scraped ? shop.sourceUrl || null : null,
    scrapedAt: scraped ? new Date().toISOString() : null,
  };
}

/**
 * Butiken och bilderna för ett lead. Går att köra om: en befintlig butik
 * återanvänds och bilderna ersätts, så två körningar ger en butik.
 */
async function personaAsset(
  lead: LeadRow,
  doc: BadgeDocument,
  brand: OutreachBrand,
  options: PrepareOptions,
): Promise<{ outcome: PersonaOutcome; asset: AssetInput | null; workplace: string | null }> {
  const mode = options.persona ?? "keep";
  const workplace = brand.workplace ?? null;
  if (mode === "skip") return { outcome: "skipped", asset: null, workplace };
  if (mode === "keep" && (await assetsForLead(requireDb(), lead.id)).some((a) => a.kind === "persona")) {
    return { outcome: "kept", asset: null, workplace };
  }
  const ai = openai();
  if (!ai) return { outcome: "no-ai", asset: null, workplace };
  try {
    const place = workplace ?? (brand.scrapedFrom ? await companyWorkplace(ai, brand.scrapedFrom) : null);
    const image = await generatePersona(ai, doc, place, options.personaQuality);
    return {
      outcome: "created",
      workplace: place,
      asset: { id: newAssetId(), leadId: lead.id, kind: "persona", materialId: doc.materialId, mime: "image/jpeg", ...image, badge: doc, logoStatus: doc.logo ? "logo" : "text-only" },
    };
  } catch (error) {
    console.warn(`Personbilden gick inte att göra för lead ${lead.id}:`, error instanceof Error ? error.message : error);
    return { outcome: "failed", asset: null, workplace };
  }
}

export async function prepareDemo(lead: LeadRow, options: PrepareOptions = {}): Promise<DemoOutcome> {
  const sql = requireDb();
  const found = await shopForLead(lead);
  if ("error" in found) return { ok: false, reason: found.error };
  const { shop, source } = found;
  if (!(await claimLeadShop(sql, lead.id, shop.slug))) return { ok: false, reason: SHOP_TAKEN };
  const scraped = source !== "shell" && shop.sourceUrl !== "";
  const brand = brandOf(shop, scraped, lead.brand);

  const logoBytes = dataUrlBytes(shop.profile.logo);
  const traced = logoBytes ? await traceLogoBuffer(logoBytes) : null;
  const input = { contactName: lead.contactName, companyName: lead.companyName };
  const hero = badgeForLead(input, traced);
  const fonts = await loadNodeFontEngine();

  const heroImage = await heroJpeg(hero.doc, fonts);
  const assets: AssetInput[] = [
    { id: newAssetId(), leadId: lead.id, kind: "hero", materialId: hero.doc.materialId, mime: "image/jpeg", ...heroImage, badge: hero.doc, logoStatus: hero.logoStatus },
  ];
  for (const choice of tileChoices()) {
    const tile = badgeForLead(input, traced, choice);
    const image = await tileJpeg(tile.doc, fonts);
    assets.push({ id: newAssetId(), leadId: lead.id, kind: "tile", materialId: tile.doc.materialId, mime: "image/jpeg", ...image, badge: tile.doc, logoStatus: tile.logoStatus });
  }

  const personaBadge = badgeForLead({ ...input, contactName: personaBadgeName(lead.contactName) }, traced);
  const persona = await personaAsset(lead, personaBadge.doc, brand, options);

  await sql.begin(async (tx) => {
    await setLeadShop(tx, lead.id, shop.slug, { ...brand, workplace: persona.workplace });
    await replaceAssets(tx, lead.id, assets);
    if (persona.asset) await replaceAssets(tx, lead.id, [persona.asset], ["persona"]);
  });
  return { ok: true, slug: shop.slug, source, logoStatus: hero.logoStatus, persona: persona.outcome };
}
