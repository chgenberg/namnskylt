"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MAX_ORDER_BADGES } from "@/engine";
import { requireDb } from "@/lib/db/client";
import { insertDemoData, removeDemoData } from "@/lib/orders/demo-data";
import { pricingSchema, type Pricing } from "@/lib/orders/pricing";
import { purchaseTermsSchema, type PurchaseTerms } from "@/lib/orders/purchase";
import { companyProfileSchema, type CompanyProfile } from "@/lib/company/profile";
import { placeOrder } from "@/lib/orders/place-order";
import { repeatBadges, staffBadges } from "@/lib/orders/repeat";
import {
  createProof,
  deleteDesign,
  deleteOrder,
  getBadgeShot,
  saveCompanyProfile,
  savePurchaseTerms,
  getCustomer,
  getDesign,
  getOrder,
  saveDesign,
  updateOrderPricing,
  upsertCustomer,
} from "@/lib/orders/repository";
import { siteOrigin } from "@/lib/http/origin";
import { requireReseller } from "@/lib/reseller-auth/session";

export type ActionResult = { ok: true; orderNo?: string; url?: string } | { ok: false; error: string };

const orderNoSchema = z.string().regex(/^NS-\d{1,9}$/);
const namesSchema = z.string().trim().min(1).max(20_000);
const quantitySchema = z.number().int().min(1).max(1000);

function fail(error: unknown, fallback: string): ActionResult {
  if (error instanceof z.ZodError) return { ok: false, error: "Ogiltiga uppgifter" };
  console.error(fallback, error);
  return { ok: false, error: fallback };
}

function done(orderNo?: string, url?: string): ActionResult {
  revalidatePath("/admin", "layout");
  return { ok: true, orderNo, url };
}

export async function repeatOrderAction(orderNo: string): Promise<ActionResult> {
  const tenant = await requireReseller();
  try {
    const original = await getOrder(tenant, orderNoSchema.parse(orderNo));
    if (!original || original.badges.length === 0) return { ok: false, error: "Ordern finns inte" };
    const placed = await placeOrder({
      tenant,
      customer: original.customer,
      badges: repeatBadges(original.badges),
      source: "repeat",
      repeatOf: original.id,
      note: `Beställd igen från ${original.orderNo}`,
      demo: original.demo,
      badgeShot: original.hasBadgeShot ? await getBadgeShot(tenant, original.orderNo) : null,
    });
    return done(placed.orderNumber);
  } catch (error) {
    return fail(error, "Ordern kunde inte läggas");
  }
}

export async function staffOrderAction(orderNo: string, names: string, quantity: number): Promise<ActionResult> {
  const tenant = await requireReseller();
  try {
    const original = await getOrder(tenant, orderNoSchema.parse(orderNo));
    const template = original?.badges[0];
    if (!original || !template) return { ok: false, error: "Ordern finns inte" };
    const badges = staffBadges(template, namesSchema.parse(names), quantitySchema.parse(quantity));
    if (badges.length === 0) return { ok: false, error: "Skriv minst ett namn" };
    if (badges.length > MAX_ORDER_BADGES) return { ok: false, error: `Högst ${MAX_ORDER_BADGES} namn per order` };
    const placed = await placeOrder({
      tenant,
      customer: original.customer,
      badges,
      source: "staff",
      repeatOf: original.id,
      note: `Ny personal, samma design som ${original.orderNo}`,
      demo: original.demo,
    });
    return done(placed.orderNumber);
  } catch (error) {
    return fail(error, "Ordern kunde inte läggas");
  }
}

export async function orderFromDesignAction(designId: string, names: string, quantity: number): Promise<ActionResult> {
  const tenant = await requireReseller();
  try {
    const design = await getDesign(tenant, z.uuid().parse(designId));
    const customer = design ? await getCustomer(tenant, design.customerId) : null;
    if (!design || !customer) return { ok: false, error: "Mallen finns inte" };
    const badges = staffBadges(design.doc, namesSchema.parse(names), quantitySchema.parse(quantity));
    if (badges.length === 0) return { ok: false, error: "Skriv minst ett namn" };
    if (badges.length > MAX_ORDER_BADGES) return { ok: false, error: `Högst ${MAX_ORDER_BADGES} namn per order` };
    const placed = await placeOrder({
      tenant,
      customer,
      badges,
      source: "template",
      note: `Från mallen ”${design.name}”`,
      demo: customer.demo,
    });
    return done(placed.orderNumber);
  } catch (error) {
    return fail(error, "Ordern kunde inte läggas");
  }
}

export async function createProofAction(orderNo: string): Promise<ActionResult> {
  const tenant = await requireReseller();
  try {
    const token = await createProof(tenant, orderNoSchema.parse(orderNo));
    if (!token) return { ok: false, error: "Ordern finns inte" };
    return done(orderNo, `${await siteOrigin()}/korrektur/${token}`);
  } catch (error) {
    return fail(error, "Korrekturlänken kunde inte skapas");
  }
}

export async function saveDesignAction(orderNo: string, badgeIndex: number, name: string): Promise<ActionResult> {
  const tenant = await requireReseller();
  try {
    const order = await getOrder(tenant, orderNoSchema.parse(orderNo));
    const badge = order?.badges[z.number().int().min(0).parse(badgeIndex)];
    if (!order || !badge) return { ok: false, error: "Skylten finns inte" };
    await saveDesign(tenant, order.customer.id, z.string().trim().min(1).max(80).parse(name), badge);
    return done();
  } catch (error) {
    return fail(error, "Mallen kunde inte sparas");
  }
}

export async function deleteOrderAction(orderNo: string): Promise<ActionResult> {
  const tenant = await requireReseller();
  try {
    const ok = await deleteOrder(tenant, orderNoSchema.parse(orderNo));
    return ok ? done() : { ok: false, error: "Ordern finns inte" };
  } catch (error) {
    return fail(error, "Ordern kunde inte tas bort");
  }
}

export async function savePurchaseTermsAction(terms: PurchaseTerms): Promise<ActionResult> {
  const tenant = await requireReseller();
  try {
    await savePurchaseTerms(tenant, purchaseTermsSchema.parse(terms));
    return done();
  } catch (error) {
    return fail(error, "Inköpspriserna kunde inte sparas");
  }
}

export async function saveCompanyProfileAction(profile: CompanyProfile): Promise<ActionResult> {
  const tenant = await requireReseller();
  try {
    await saveCompanyProfile(tenant, companyProfileSchema.parse(profile));
    revalidatePath("/offert", "layout");
    return done();
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Ogiltiga uppgifter" };
    return fail(error, "Uppgifterna kunde inte sparas");
  }
}

export async function deleteDesignAction(designId: string): Promise<ActionResult> {
  const tenant = await requireReseller();
  try {
    await deleteDesign(tenant, z.uuid().parse(designId));
    return done();
  } catch (error) {
    return fail(error, "Mallen kunde inte tas bort");
  }
}

export async function insertDemoDataAction(): Promise<ActionResult> {
  const tenant = await requireReseller();
  try {
    await insertDemoData(requireDb(), tenant);
    return done();
  } catch (error) {
    return fail(error, "Demodatan kunde inte läggas in");
  }
}

export async function removeDemoDataAction(): Promise<ActionResult> {
  const tenant = await requireReseller();
  try {
    await removeDemoData(requireDb(), tenant);
    return done();
  } catch (error) {
    return fail(error, "Demodatan kunde inte tas bort");
  }
}

const optionalText = (max: number) => z.string().trim().max(max).optional();
const startOrderSchema = z.union([
  z.object({
    customerId: z.uuid(),
    text: z.string().max(300).optional(),
    project: optionalText(120),
    mode: z.enum(["order", "quote"]),
  }),
  z.object({
    name: z.string().trim().min(1).max(120),
    email: z.email(),
    company: optionalText(120),
    phone: optionalText(40),
    orgNumber: optionalText(20),
    address: optionalText(300),
    text: z.string().max(300).optional(),
    project: optionalText(120),
    mode: z.enum(["order", "quote"]),
  }),
]);

/** Första steget i "Skapa order/offert": kunden väljs eller skapas, sedan öppnas designern åt den kunden. */
export async function startOrderAction(input: z.input<typeof startOrderSchema>): Promise<ActionResult> {
  const tenant = await requireReseller();
  try {
    const parsed = startOrderSchema.parse(input);
    const customer =
      "customerId" in parsed
        ? await getCustomer(tenant, parsed.customerId)
        : await upsertCustomer(tenant, {
            name: parsed.name,
            email: parsed.email,
            company: parsed.company || null,
            phone: parsed.phone || null,
            orgNumber: parsed.orgNumber || null,
            address: parsed.address || null,
          });
    if (!customer) return { ok: false, error: "Kunden finns inte" };
    const params = new URLSearchParams({ kund: customer.id });
    if (parsed.mode === "quote") {
      params.set("offert", "1");
      if (parsed.project?.trim()) params.set("projekt", parsed.project.trim());
    } else if (parsed.text?.trim()) {
      params.set("t", parsed.text.trim());
    }
    revalidatePath("/admin/kunder");
    return { ok: true, url: `/skapa?${params}` };
  } catch (error) {
    return fail(error, "Kunden kunde inte sparas");
  }
}

export async function updateOrderPricingAction(orderNo: string, pricing: Pricing): Promise<ActionResult> {
  const tenant = await requireReseller();
  try {
    const ok = await updateOrderPricing(tenant, orderNoSchema.parse(orderNo), pricingSchema.parse(pricing));
    return ok ? done(orderNo) : { ok: false, error: "Ordern finns inte" };
  } catch (error) {
    return fail(error, "Priserna kunde inte sparas");
  }
}
