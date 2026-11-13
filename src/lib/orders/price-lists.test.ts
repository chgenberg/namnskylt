import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import * as engine from "@/engine";
import { endPriceTable, resellerPriceTable, type PriceModel } from "@/engine";
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

describe("kalkylens siffror stannar på servern", () => {
  it("motorns export innehåller inte standardmodellen", () => {
    assert.equal("DEFAULT_PRICE_MODEL" in engine, false);
  });

  it("bara serverkod och tester importerar standardmodellen", () => {
    const root = join(process.cwd(), "src");
    const offenders = readdirSync(root, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file) && !file.endsWith(".test.ts") && file !== join("engine", "default-price-model.ts"))
      .filter((file) => {
        const source = readFileSync(join(root, file), "utf8");
        // Utan `server-only` kan filen dras in i en klientkomponent, och då hamnar siffrorna i webbläsaren.
        return source.includes("default-price-model") && !/^import "server-only";$/m.test(source);
      });
    assert.deepEqual(offenders, []);
  });
});
