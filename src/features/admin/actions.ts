"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MAX_ORDER_BADGES } from "@/engine";
import { priceModelSchema, type PriceModel } from "@/engine/price-model";
import { requireDb } from "@/lib/db/client";
import { insertDemoData, removeDemoData } from "@/lib/orders/demo-data";
import { pricingSchema, type Pricing } from "@/lib/orders/pricing";
import { companyProfileSchema, type CompanyProfile } from "@/lib/company/profile";
import { deliverySchema, type Delivery } from "@/lib/orders/delivery";
import { NOT_OFFERED_ERROR, allOffered } from "@/lib/orders/model";
import { placeOrder } from "@/lib/orders/place-order";
import { repeatBadges, staffBadges } from "@/lib/orders/repeat";
import {
  createProof,
  deleteDesign,
  deleteOrder,
  getBadgeShot,
  saveCompanyProfile,
  getPriceModel,
  savePriceModel,
  getCustomer,
  getDesign,
  getOrder,
  latestCustomerDelivery,
  saveDesign,
  saveResellerDeliveryAddress,
  updateOrderDelivery,
  updateOrderPricing,
  upsertCustomer,
} from "@/lib/orders/repository";
import { siteOrigin } from "@/lib/http/origin";
import { requireReseller } from "@/lib/reseller-auth/session";
import { isOwner } from "@/lib/tenants/model";

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
    if (!allOffered(original.badges)) return { ok: false, error: NOT_OFFERED_ERROR };
    const placed = await placeOrder({
      tenant,
      customer: original.customer,
      badges: repeatBadges(original.badges),
      source: "repeat",
      repeatOf: original.id,
      note: `Beställd igen från ${original.orderNo}`,
      // Samma leverans som förra gången. Saknas den fylls den i på ordern innan den går till verkstaden.
      delivery: original.delivery,
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
    if (!allOffered(badges)) return { ok: false, error: NOT_OFFERED_ERROR };
    const placed = await placeOrder({
      tenant,
      customer: original.customer,
      badges,
      source: "staff",
      repeatOf: original.id,
      note: `Ny personal, samma design som ${original.orderNo}`,
      delivery: original.delivery,
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
    if (!allOffered(badges)) return { ok: false, error: NOT_OFFERED_ERROR };
    const lastUsed = await latestCustomerDelivery(tenant, customer.id);
    const placed = await placeOrder({
      tenant,
      customer,
      badges,
      source: "template",
      note: `Från mallen ”${design.name}”`,
      delivery: lastUsed ? { to: "customer", address: lastUsed } : null,
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

/** Prismodellen styr alla priser på sajten — bara ägaren får ändra den. */
export async function savePriceModelAction(model: PriceModel): Promise<ActionResult> {
  const tenant = await requireReseller();
  if (!isOwner(tenant)) return { ok: false, error: "Bara namnskylt.com kan ändra prismodellen" };
  try {
    await savePriceModel(priceModelSchema.parse(model));
    revalidatePath("/", "layout");
    return done();
  } catch (error) {
    return fail(error, "Prismodellen kunde inte sparas");
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
    await insertDemoData(requireDb(), tenant, await getPriceModel());
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
    if (parsed.mode === "quote") params.set("offert", "1");
    if (parsed.project?.trim()) params.set("projekt", parsed.project.trim());
    revalidatePath("/admin/kunder");
    return { ok: true, url: `/skapa?${params}` };
  } catch (error) {
    return fail(error, "Kunden kunde inte sparas");
  }
}

/** Ny leveransadress på en order som ännu inte gått till verkstaden. "Till oss" sparas också som återförsäljarens adress. */
export async function updateOrderDeliveryAction(orderNo: string, delivery: Delivery): Promise<ActionResult> {
  const tenant = await requireReseller();
  try {
    const parsed = deliverySchema.parse(delivery);
    const ok = await updateOrderDelivery(tenant, orderNoSchema.parse(orderNo), parsed);
    if (!ok) return { ok: false, error: "Ordern har redan gått till verkstaden. Hör av dig till namnskylt.com om adressen ska ändras." };
    if (parsed.to === "reseller") await saveResellerDeliveryAddress(tenant, parsed.address);
    return done(orderNo);
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Ogiltig adress" };
    return fail(error, "Adressen kunde inte sparas");
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
