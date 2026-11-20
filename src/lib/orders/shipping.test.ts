import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument, priceItemsOf, withTexts, type BadgeDocument } from "@/engine";
import { orderShippingSek } from "@/engine/price-model";
import { DEFAULT_PRICE_MODEL } from "@/engine/default-price-model";
import { plasticBadge } from "@/engine/testing";
import { shippingItems, shippingRequestSchema } from "./shipping";

/** En ny skylt: metall, som bara går att printa på. */
const metal: BadgeDocument = createBadgeDocument(["Anna Lind"]);
/** En plastskylt utan vald metod, alltså graverad. */
const plastic: BadgeDocument = plasticBadge(["Anna Lind"]);

describe("frågan om frakt", () => {
  it("slår ihop likadana skyltar, så att hundra namn blir en rad", () => {
    const names = Array.from({ length: 100 }, (_, i) => withTexts(metal, [`Person ${i}`]));
    assert.deepEqual(shippingItems(names), [
      { signClass: "premium", mounting: "pin", extraEngraving: false, customShape: false, marking: "print", quantity: 100 },
    ]);
  });

  it("håller isär märkningsmetoderna, eftersom de kan ha olika pris", () => {
    // På plast finns båda metoderna. Metallen går bara att printa på.
    const items = shippingItems([
      { ...plastic, quantity: 2 },
      { ...plastic, marking: "print", quantity: 3 },
      { ...withTexts(plastic, ["Bo Ek"]), marking: "print", quantity: 1 },
    ]);
    assert.deepEqual(
      items.map((item) => [item.marking, item.quantity]),
      [
        ["engrave", 2],
        ["print", 4],
      ],
    );
    assert.equal(shippingRequestSchema.safeParse({ items }).success, true);
    assert.equal(shippingRequestSchema.safeParse({ items: [{ ...items[0], marking: "laser" }] }).success, false);
    // En fråga från en sida som laddades före märkningsmetoden saknar fältet och går fortfarande igenom.
    const older = items.map((item) => ({ signClass: item.signClass, mounting: item.mounting, extraEngraving: false, customShape: false, quantity: 1 }));
    assert.equal(shippingRequestSchema.safeParse({ items: older }).success, true);
  });

  it("håller isär skyltar med och utan ram, eftersom ramen kostar extra", () => {
    const framed: BadgeDocument = { ...plastic, frame: { ...plastic.frame, style: "double" } };
    const items = shippingItems([
      { ...plastic, quantity: 2 },
      { ...framed, quantity: 3 },
      { ...withTexts(framed, ["Bo Ek"]), frame: { ...framed.frame, style: "solid" }, quantity: 1 },
    ]);
    assert.deepEqual(
      items.map((item) => [item.frame ?? false, item.quantity]),
      [
        [false, 2],
        [true, 4],
      ],
    );
    assert.equal(shippingRequestSchema.safeParse({ items }).success, true);
  });

  it("håller isär skylttyp, fäste och logga", () => {
    const items = shippingItems([
      { ...metal, quantity: 2 },
      { ...plastic, quantity: 3 },
      { ...metal, mounting: "magnet", quantity: 1 },
      { ...plastic, quantity: 1 },
    ]);
    assert.deepEqual(
      items.map((item) => [item.signClass, item.mounting, item.quantity]),
      [
        ["premium", "magnet", 1],
        ["premium", "pin", 2],
        ["standard", "pin", 4],
      ],
    );
  });

  it("innehåller varken namn, design eller logga", () => {
    const text = JSON.stringify(shippingItems([withTexts(metal, ["Hemlig Person"])]));
    assert.doesNotMatch(text, /Hemlig|texts|logo|font/);
  });

  it("ger samma frakt som skyltarna rad för rad, och samma fråga i vilken ordning skyltarna än ligger", () => {
    const badges = [
      { ...metal, quantity: 2 },
      { ...plastic, quantity: 1 },
      { ...withTexts(metal, ["Bo Ek"]), quantity: 1 },
    ];
    for (const quantity of [1, 2, 3, 10]) {
      const order = badges.map((badge) => ({ ...badge, quantity: badge.quantity * quantity }));
      assert.equal(orderShippingSek(DEFAULT_PRICE_MODEL, shippingItems(order)), orderShippingSek(DEFAULT_PRICE_MODEL, priceItemsOf(order)));
    }
    assert.deepEqual(shippingItems(badges), shippingItems([...badges].reverse()));
  });

  it("en tom order ger en tom fråga", () => {
    assert.deepEqual(shippingItems([]), []);
  });

  it("servern tar bara emot skyltarnas typ och antal", () => {
    const items = shippingItems([{ ...metal, quantity: 3 }]);
    assert.equal(shippingRequestSchema.safeParse({ items }).success, true);
    assert.equal(shippingRequestSchema.safeParse({ items: [] }).success, false);
    assert.equal(shippingRequestSchema.safeParse({ items: [{ ...items[0], quantity: 0 }] }).success, false);
    assert.equal(shippingRequestSchema.safeParse({ items: [{ ...items[0], mounting: null }] }).success, false);
    assert.equal(shippingRequestSchema.safeParse({ items: [{ ...items[0], priceSek: 1 }] }).success, false);
    assert.equal(shippingRequestSchema.safeParse({ items, model: DEFAULT_PRICE_MODEL }).success, false);
  });
});
