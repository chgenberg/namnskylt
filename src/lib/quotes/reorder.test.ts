import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument, resellerOrder, toOfferedDocument, type BadgeDocument } from "@/engine";
import { DEFAULT_PRICE_MODEL } from "@/engine/default-price-model";
import { customerHead, customerTimeline } from "@/lib/orders/customer-view";
import type { DeliveryAddress } from "@/lib/orders/delivery";
import { priceListsFor, shippingFor } from "@/lib/orders/price-lists";
import { acceptedDelivery } from "./accept";
import { reorderMode, reorderPricing } from "./reorder-model";
import { quoteShippingMethods, shownShippingOptions } from "./shipping";

const offered = toOfferedDocument(createBadgeDocument(["Anna Lind", "Säljare"]));
const old: BadgeDocument = { ...offered, materialId: "brass" as BadgeDocument["materialId"] };
const source = { status: "delivered", badges: [offered], paid: false, erased: false };

describe("beställ fler med samma design", () => {
  it("blir en offert för en order på faktura och skyltmotorn för en kortbetald", () => {
    assert.equal(reorderMode(source), "quote");
    assert.equal(reorderMode({ ...source, paid: true }), "designer");
  });

  it("går inte för en borttagen kund, en tom order eller en design som inte säljs längre", () => {
    assert.equal(reorderMode({ ...source, erased: true }), "none");
    assert.equal(reorderMode({ ...source, badges: [] }), "none");
    assert.equal(reorderMode({ ...source, badges: [old] }), "none");
  });

  it("tar med kundens rabatt men inte à-priser eller extrarader från den gamla ordern", () => {
    assert.equal(reorderPricing(null), null);
    assert.equal(reorderPricing({ unitOverrides: [99], discountPercent: 0, extras: [] }), null);
    assert.deepEqual(reorderPricing({ unitOverrides: [99, null], discountPercent: 10, extras: [{ label: "Uppsättning", amountSek: 500 }] }), {
      unitOverrides: [],
      discountPercent: 10,
      extras: [],
    });
  });
});

describe("leveranssättet när kunden godkänner en offert", () => {
  const stored: DeliveryAddress = { name: "Exempel AB", contactName: null, line1: "Lagervägen 2", line2: null, zip: "222 33", city: "Lund", country: "SE", phone: null };
  const typed: DeliveryAddress = { ...stored, line1: "Storgatan 1", zip: "111 22", city: "Stockholm" };

  it("namnskylt.coms kunder väljer bland alla sätt, en återförsäljares kund inte upphämtning", () => {
    assert.deepEqual(quoteShippingMethods(true, "standard"), ["standard", "parcel", "express", "pickup"]);
    assert.deepEqual(quoteShippingMethods(false, "standard"), ["standard", "parcel", "express"]);
  });

  it("det sätt som redan står på offerten finns alltid med", () => {
    assert.deepEqual(quoteShippingMethods(false, "pickup"), ["standard", "parcel", "express", "pickup"]);
    assert.deepEqual(quoteShippingMethods(false, "express"), ["standard", "parcel", "express"]);
  });

  it("paketet visas bara när det är ett annat val än standardfrakten", () => {
    const option = (method: "standard" | "parcel" | "express", shippingSek: number) => ({ method, shippingSek });
    // Ordern går som varubrev: paketet är ett eget val.
    const small = [option("standard", 75), option("parcel", 159), option("express", 0)];
    assert.deepEqual(shownShippingOptions(small, "standard").map((o) => o.method), ["standard", "parcel", "express"]);
    // Ordern går redan som paket: då finns inget att välja mellan.
    const large = [option("standard", 159), option("parcel", 159), option("express", 0)];
    assert.deepEqual(shownShippingOptions(large, "standard").map((o) => o.method), ["standard", "express"]);
    // Står paketet redan på offerten visas det ändå.
    assert.deepEqual(shownShippingOptions(large, "parcel").map((o) => o.method), ["standard", "parcel", "express"]);
  });

  it("kundens val gäller när skyltarna ska till kunden", () => {
    assert.deepEqual(acceptedDelivery({ delivery: { to: "customer", address: stored } }, typed, "express"), { to: "customer", address: typed, method: "express" });
    // Väljer kunden standardfrakt på en offert med express blir det standardfrakt.
    assert.deepEqual(acceptedDelivery({ delivery: { to: "customer", address: stored, method: "express" } }, typed, "standard"), { to: "customer", address: typed });
  });

  it("kunden kan inte ändra leveranssättet när skyltarna ska till återförsäljaren", () => {
    assert.deepEqual(acceptedDelivery({ delivery: { to: "reseller", address: stored, method: "pickup" } }, typed, "express"), {
      to: "reseller",
      address: stored,
      method: "pickup",
    });
  });
});

describe("expressfraktens pris", () => {
  const badges = [{ ...offered, quantity: 10 }];

  it("är 0 tills verkstaden har satt det, och sedan samma belopp för kunden och återförsäljaren", () => {
    assert.equal(shippingFor(DEFAULT_PRICE_MODEL, badges, "express"), 0);
    assert.equal(shippingFor(DEFAULT_PRICE_MODEL, badges, "express", 249), 249);
    const before = priceListsFor(DEFAULT_PRICE_MODEL, DEFAULT_PRICE_MODEL, "reseller", badges, "express");
    assert.equal(before.shippingSek, 0);
    assert.ok(before.purchaseList);
    assert.equal(resellerOrder(badges, before.purchaseList).shippingSek, 0);
    const after = priceListsFor(DEFAULT_PRICE_MODEL, DEFAULT_PRICE_MODEL, "reseller", badges, "express", 249);
    assert.equal(after.shippingSek, 249);
    assert.ok(after.purchaseList);
    assert.equal(resellerOrder(badges, after.purchaseList).shippingSek, 249);
  });

  it("gäller bara expressfrakt: standardfrakt och upphämtning rörs inte av det", () => {
    assert.equal(shippingFor(DEFAULT_PRICE_MODEL, badges, "standard", 249), shippingFor(DEFAULT_PRICE_MODEL, badges, "standard"));
    assert.equal(shippingFor(DEFAULT_PRICE_MODEL, badges, "pickup", 249), 0);
    assert.equal(priceListsFor(DEFAULT_PRICE_MODEL, DEFAULT_PRICE_MODEL, "customer", badges, "express", 249).purchaseList, undefined);
  });
});

describe("orderns tidslinje för kunden", () => {
  const at = (status: "received" | "proof-sent" | "approved" | "in-production" | "shipped", day: string) => ({ status, note: null, at: `2026-11-${day}T10:00:00.000Z` });

  it("hoppar över korrekturen när inget korrektur skickades", () => {
    const steps = customerTimeline("in-production", [at("received", "10"), at("in-production", "12")]);
    assert.deepEqual(steps.map((step) => step.status), ["received", "in-production", "shipped", "delivered"]);
    assert.deepEqual(steps.map((step) => step.done), [true, true, false, false]);
    assert.equal(steps.find((step) => step.current)?.status, "in-production");
    assert.equal(steps[0]?.at, "2026-11-10T10:00:00.000Z");
    assert.equal(steps[2]?.at, null);
  });

  it("visar korrekturens steg när ett korrektur skickades", () => {
    const steps = customerTimeline("approved", [at("received", "10"), at("proof-sent", "11"), at("approved", "12")]);
    assert.deepEqual(steps.map((step) => step.status), ["received", "proof-sent", "approved", "in-production", "shipped", "delivered"]);
    assert.equal(steps.filter((step) => step.done).length, 3);
  });

  it("har ingen tidslinje för en avbruten order", () => {
    assert.deepEqual(customerTimeline("cancelled", [at("received", "10")]), []);
  });

  it("en order som hämtas i Högsbo är Klar att hämta och Hämtad, inte Skickad och Levererad", () => {
    const steps = customerTimeline("shipped", [at("received", "10"), at("shipped", "12")], true);
    assert.deepEqual(steps.map((step) => step.label), ["Mottagen", "I produktion", "Klar att hämta", "Hämtad"]);
    assert.equal(customerHead("shipped", true).title, "Dina skyltar är klara att hämta");
    assert.equal(customerHead("shipped").title, "Dina skyltar är skickade");
    // Ett steg som inte har något eget för upphämtning behåller sin vanliga text.
    assert.equal(customerHead("proof-sent", true).title, customerHead("proof-sent").title);
  });
});
