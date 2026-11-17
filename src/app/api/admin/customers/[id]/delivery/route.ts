import { NextResponse } from "next/server";
import { z } from "zod";
import { deliveryOptions } from "@/lib/orders/delivery-options";
import { isErasedCustomer } from "@/lib/orders/erase-model";
import { databaseConfigured, getCustomer } from "@/lib/orders/repository";
import { currentTenant } from "@/lib/reseller-auth/session";

export const runtime = "nodejs";

/**
 * Kundens leveransadress som den fylls i när säljaren väljer kunden i
 * skyltmotorns varukorg: adressen från kundens senaste order, annars det som
 * går att tolka ur kundens uppgifter. Bara säljarens egna kunder.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const tenant = databaseConfigured() ? await currentTenant() : null;
  if (!tenant) return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  const id = z.uuid().safeParse((await params).id);
  const customer = id.success ? await getCustomer(tenant, id.data) : null;
  if (!customer || isErasedCustomer(customer)) return NextResponse.json({ error: "Kunden finns inte" }, { status: 404 });
  return NextResponse.json({ delivery: (await deliveryOptions(tenant, customer)).customer });
}
