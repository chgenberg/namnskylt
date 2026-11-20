import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import * as engine from "@/engine";
import { endPriceTable, resellerPriceTable, type PriceModel } from "@/engine/price-model";
import { DEFAULT_PRICE_MODEL } from "@/engine/default-price-model";
import { TIERED_SHIPPING } from "@/engine/testing";
import { priceListsFor, shippingFor, storedPriceModel } from "./price-lists";

/** Kalkylen med fraktregeln som har en gräns i varuvärde, som testerna här prövar. */
const M = { ...DEFAULT_PRICE_MODEL, shipping: TIERED_SHIPPING };
/** Tre metallskyltar med nål: återförsäljaren betalar 434,01 kr för varorna, kunden 723 kr. */
const THREE = [{ ...engine.createBadgeDocument(["Anna Lind"]), quantity: 3 }];
/** En äldre modell: dyrare skyltar och annan provision än dagens. */
const OLDER: PriceModel = {
  ...M,
  tiers: M.tiers.map((tier) => ({ ...tier, provisionPercent: 25 })),
  signs: { premium: [90, 85, 80, 75], standard: [60, 57, 53, 50] },
};

describe("prislistor per part", () => {
  it("upphämtning och express ger ingen frakt åt någon part, och inköpslistan räknar likadant", () => {
    for (const method of ["pickup", "express"] as const) {
      const customer = priceListsFor(M, M, "customer", THREE, method);
      const reseller = priceListsFor(M, M, "reseller", THREE, method);
      assert.equal(customer.shippingSek, 0, method);
      assert.equal(reseller.shippingSek, 0, method);
      assert.equal(engine.resellerOrder(THREE, reseller.purchaseList ?? endPriceTable(M)).shippingSek, 0, method);
      assert.equal(shippingFor(M, THREE, method), 0, method);
    }
    assert.equal(priceListsFor(M, M, "reseller", THREE, "standard").shippingSek, 75);
  });

  it("kunden får bara sin egen prislista, aldrig inköpspriserna", () => {
    const lists = priceListsFor(M, M, "customer", THREE);
    assert.deepEqual(Object.keys(lists), ["priceList", "shippingSek"]);
    assert.deepEqual(lists.priceList, endPriceTable(M));
  });

  it("kunden och återförsäljaren får samma frakt, räknad på det återförsäljaren betalar", () => {
    const customer = priceListsFor(M, M, "customer", THREE);
    const reseller = priceListsFor(M, M, "reseller", THREE);
    assert.equal(customer.shippingSek, 75);
    assert.equal(reseller.shippingSek, 75);
    assert.equal(reseller.purchaseList && engine.resellerOrder(THREE, reseller.purchaseList).shippingSek, 75);
    // Kundens lista har ingen fraktregel att räkna på sitt eget varuvärde med.
    assert.equal(customer.priceList.shipping, undefined);
    assert.equal(shippingFor(M, [{ ...THREE[0]!, quantity: 4 }]), 159);
  });

  it("en rad från före frakten har ingen frakt", () => {
    const beforeShipping: Record<string, unknown> = { ...M };
    delete beforeShipping.shipping;
    assert.equal(priceListsFor(JSON.parse(JSON.stringify(beforeShipping)), M, "customer", THREE).shippingSek, 0);
  });

  it("återförsäljaren får sina inköpspriser men inte provisionen", () => {
    const lists = priceListsFor(M, M, "reseller", THREE);
    assert.deepEqual(lists.purchaseList, resellerPriceTable(M));
    assert.doesNotMatch(JSON.stringify(lists), /provision|margin/i);
  });

  it("ingen part får provisionen, vad den än är satt till", () => {
    const odd: PriceModel = { ...M, tiers: M.tiers.map((tier, i) => ({ ...tier, provisionPercent: 37.5 + i })) };
    for (const audience of ["customer", "reseller"] as const) {
      const text = JSON.stringify(priceListsFor(odd, M, audience, THREE));
      assert.doesNotMatch(text, /provision/i, audience);
      assert.doesNotMatch(text, /37\.5|38\.5|39\.5|40\.5/, audience);
    }
  });

  it("räknar med modellen raden sparades med, inte med dagens", () => {
    const lists = priceListsFor(JSON.parse(JSON.stringify(OLDER)), M, "reseller", THREE);
    assert.deepEqual(lists.purchaseList?.signs.premium, [90, 85, 80, 75]);
    assert.deepEqual(lists.priceList, endPriceTable(OLDER));
  });

  it("en rad utan sparad modell, eller med en trasig, räknas med dagens", () => {
    assert.equal(storedPriceModel(null, M), M);
    assert.equal(storedPriceModel({ tiers: [] }, M), M);
    assert.deepEqual(priceListsFor(null, M, "customer", THREE).priceList, endPriceTable(M));
  });
});

/** Källfilerna under src, utom tester. */
function sourceFiles(): { file: string; source: string }[] {
  const root = join(process.cwd(), "src");
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((file) => /\.tsx?$/.test(file) && !file.endsWith(".test.ts"))
    .map((file) => ({ file: file.split("\\").join("/"), source: readFileSync(join(root, file), "utf8") }));
}

const SERVER_ONLY = /^import "server-only";$/m;
const SERVER_ACTIONS = /^"use server";$/m;
/** Sidor, layouter och API-vägar körs bara på servern och kan inte importeras av en klientkomponent. */
const APP_SERVER_FILE = /^app\/(.*\/)?(page|layout)\.tsx$|^app\/(.*\/)?route\.ts$/;
/** Adminverktyget för prismodellen: laddas bara när admin öppnar sidan (se price-model-editor-lazy.tsx). */
const MODEL_EDITOR = /^features\/admin\/price-model\//;

describe("prismodellen stannar på servern", () => {
  it("motorns export innehåller varken modellen, dess schema eller provisionen", () => {
    for (const name of ["DEFAULT_PRICE_MODEL", "priceModelSchema", "provisionSplit", "endPriceTable", "resellerPriceTable"]) {
      assert.equal(name in engine, false, name);
    }
  });

  it("bara serverkod och tester importerar kalkylens siffror", () => {
    const offenders = sourceFiles()
      .filter(({ file }) => file !== "engine/default-price-model.ts")
      // Utan `server-only` kan filen dras in i en klientkomponent, och då hamnar siffrorna i webbläsaren.
      .filter(({ source }) => source.includes("default-price-model") && !SERVER_ONLY.test(source))
      .map(({ file }) => file);
    assert.deepEqual(offenders, []);
  });

  it("bara serverkod och adminverktyget importerar prismodellens kod", () => {
    // `import type` försvinner vid bygget och räknas inte.
    const valueImport = /^import (?!type )[^;]*from "[^"]*\/price-model";$/m;
    const offenders = sourceFiles()
      .filter(({ source }) => valueImport.test(source))
      .filter(({ file, source }) => !SERVER_ONLY.test(source) && !SERVER_ACTIONS.test(source) && !APP_SERVER_FILE.test(file) && !MODEL_EDITOR.test(file))
      .map(({ file }) => file);
    assert.deepEqual(offenders, []);
  });

  it("ordet provision finns bara i serverkod och i adminverktyget", () => {
    // Kommentarer följer inte med i bygget; sök i koden utan dem.
    const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const offenders = sourceFiles()
      .filter(({ source }) => /provision/i.test(code(source)))
      .filter(
        ({ file, source }) =>
          !SERVER_ONLY.test(source) &&
          !SERVER_ACTIONS.test(source) &&
          !APP_SERVER_FILE.test(file) &&
          !MODEL_EDITOR.test(file) &&
          file !== "engine/price-model.ts" &&
          file !== "engine/default-price-model.ts",
      )
      .map(({ file }) => file);
    assert.deepEqual(offenders, []);
  });
});
