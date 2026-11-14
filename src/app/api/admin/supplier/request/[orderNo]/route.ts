import { NextResponse } from "next/server";
import { databaseConfigured, getOrderForDispatch } from "@/lib/orders/repository";
import { currentTenant } from "@/lib/reseller-auth/session";
import { buyerFor, supplierRequestFor } from "@/lib/supplier/dispatch";
import { isOwner } from "@/lib/tenants/model";

export const runtime = "nodejs";

/**
 * Anropet till Skylt & Gravyrteknik för en order, som det skulle skickas nu.
 * Läser bara — ingenting skickas. Innehåller återförsäljarens inköpspriser, så
 * bara admin får svaret.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  const tenant = databaseConfigured() ? await currentTenant() : null;
  if (!tenant || !isOwner(tenant)) return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  const { orderNo } = await params;
  if (!/^NS-\d{1,9}$/.test(orderNo)) return NextResponse.json({ error: "Ogiltigt ordernummer" }, { status: 400 });
  const order = await getOrderForDispatch(orderNo);
  if (!order || order.demo) return NextResponse.json({ error: "Ordern finns inte" }, { status: 404 });
  const request = await supplierRequestFor(order, await buyerFor(order.resellerId));
  if (!request) return NextResponse.json({ error: "Ordern saknar uppgifter och går inte att skicka" }, { status: 409 });
  return NextResponse.json(request, { headers: { "cache-control": "no-store" } });
}
