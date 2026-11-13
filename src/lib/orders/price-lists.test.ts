import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import * as engine from "@/engine";
import { endPriceTable, resellerPriceTable, type PriceModel } from "@/engine/price-model";
import { DEFAULT_PRICE_MODEL } from "@/engine/default-price-model";
import { priceListsFor, storedPriceModel } from "./price-lists";

const M = DEFAULT_PRICE_MODEL;
/** En äldre modell: dyrare skyltar och annan provision än dagens. */
const OLDER: PriceModel = {
  ...M,
  tiers: M.tiers.map((tier) => ({ ...tier, provisionPercent: 25 })),
  signs: { premium: [90, 85, 80, 75], standard: [60, 57, 53, 50] },
};

describe("prislistor per part", () => {
  it("kunden får bara sin egen prislista, aldrig inköpspriserna", () => {
    const lists = priceListsFor(M, M, "customer");
    assert.deepEqual(Object.keys(lists), ["priceList"]);
    assert.deepEqual(lists.priceList, endPriceTable(M));
  });

  it("återförsäljaren får sina inköpspriser men inte provisionen", () => {
    const lists = priceListsFor(M, M, "reseller");
    assert.deepEqual(lists.purchaseList, resellerPriceTable(M));
    assert.doesNotMatch(JSON.stringify(lists), /provision|margin/i);
  });

  it("ingen part får provisionen, vad den än är satt till", () => {
    const odd: PriceModel = { ...M, tiers: M.tiers.map((tier, i) => ({ ...tier, provisionPercent: 37.5 + i })) };
    for (const audience of ["customer", "reseller"] as const) {
      const text = JSON.stringify(priceListsFor(odd, M, audience));
      assert.doesNotMatch(text, /provision/i, audience);
      assert.doesNotMatch(text, /37\.5|38\.5|39\.5|40\.5/, audience);
    }
  });

  it("räknar med modellen raden sparades med, inte med dagens", () => {
    const lists = priceListsFor(JSON.parse(JSON.stringify(OLDER)), M, "reseller");
    assert.deepEqual(lists.purchaseList?.signs.premium, [90, 85, 80, 75]);
    assert.deepEqual(lists.priceList, endPriceTable(OLDER));
  });

  it("en rad utan sparad modell, eller med en trasig, räknas med dagens", () => {
    assert.equal(storedPriceModel(null, M), M);
    assert.equal(storedPriceModel({ tiers: [] }, M), M);
    assert.deepEqual(priceListsFor(null, M, "customer").priceList, endPriceTable(M));
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
