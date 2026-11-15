import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { badgeDocumentSchema, createBadgeDocument, priceOrder, type BadgeDocument } from "@/engine";
import { DEFAULT_PRICE_MODEL } from "@/engine/default-price-model";
import { endPriceTable } from "@/engine/price-model";
import { deliverySchema, type Delivery } from "./delivery";
import {
  ERASED_CUSTOMER_NAME,
  ERASED_TEXT,
  accountErasureSummary,
  customerErasureSummary,
  erasedBadges,
  erasedCustomerEmail,
  erasedDelivery,
  isBookkeepingOrder,
  isErasedCustomer,
} from "./erase-model";

const facts = { demo: false, status: "received", sentToWorkshop: false, paid: false };

describe("vilka ordrar som hör till bokföringen", () => {
  it("en order som bara är mottagen får tas bort", () => {
    assert.equal(isBookkeepingOrder(facts), false);
    assert.equal(isBookkeepingOrder({ ...facts, status: "proof-sent" }), false);
    assert.equal(isBookkeepingOrder({ ...facts, status: "approved" }), false);
  });

  it("en order hos verkstaden, i produktion, levererad eller betald behålls", () => {
    assert.equal(isBookkeepingOrder({ ...facts, sentToWorkshop: true }), true);
    assert.equal(isBookkeepingOrder({ ...facts, paid: true }), true);
    for (const status of ["in-production", "shipped", "delivered"]) {
      assert.equal(isBookkeepingOrder({ ...facts, status }), true, status);
    }
  });

  it("demoordrar och avbrutna ordrar behålls aldrig", () => {
    assert.equal(isBookkeepingOrder({ ...facts, demo: true, status: "delivered", sentToWorkshop: true, paid: true }), false);
    assert.equal(isBookkeepingOrder({ ...facts, status: "cancelled", sentToWorkshop: true, paid: true }), false);
  });
});

describe("en borttagen kund", () => {
  it("känns igen på sin adress, och ingen vanlig adress gör det", () => {
    const id = "3f2b6c1e-8a4d-4e0b-9c57-1d2e3f4a5b6c";
    assert.equal(erasedCustomerEmail(id), `borttagen-${id}@borttagen.invalid`);
    assert.equal(isErasedCustomer({ email: erasedCustomerEmail(id) }), true);
    assert.equal(isErasedCustomer({ email: "anna@exempel.se" }), false);
    assert.equal(isErasedCustomer({ email: "borttagen@exempel.se" }), false);
    assert.equal(isErasedCustomer({ email: "anna@borttagen.invalid" }), false);
  });
});

describe("skyltarna utan namn", () => {
  const badges: BadgeDocument[] = [
    { ...createBadgeDocument(["Anna Lind", "Projektledare"]), quantity: 3 },
    { ...createBadgeDocument(["", "Bo Ek"]), quantity: 2, mounting: "magnet" },
  ];

  it("tar bort all text men lämnar ett giltigt dokument", () => {
    const erased = erasedBadges(badges) as BadgeDocument[];
    assert.equal(erased.length, 2);
    for (const badge of erased) assert.equal(badgeDocumentSchema.safeParse(badge).success, true);
    assert.deepEqual(
      erased.map((badge) => badge.rows.map((row) => row.text)),
      [
        [ERASED_TEXT, ""],
        ["", ERASED_TEXT],
      ],
    );
    assert.equal(JSON.stringify(erased).includes("Anna"), false);
    assert.equal(JSON.stringify(erased).includes("Bo Ek"), false);
  });

  it("ändrar varken priset eller något annat än texten", () => {
    const erased = erasedBadges(badges) as BadgeDocument[];
    const list = endPriceTable(DEFAULT_PRICE_MODEL);
    assert.deepEqual(priceOrder(erased, list, 75), priceOrder(badges, list, 75));
    const withoutText = (docs: BadgeDocument[]) => docs.map((doc) => ({ ...doc, rows: doc.rows.map((row) => ({ ...row, text: "" })) }));
    assert.deepEqual(withoutText(erased), withoutText(badges));
  });

  it("rör inte originalet och tål sparad JSON som inte är skyltar", () => {
    erasedBadges(badges);
    assert.equal(badges[0]?.rows[0]?.text, "Anna Lind");
    assert.equal(erasedBadges(null), null);
    assert.deepEqual(erasedBadges([{ rows: "trasig" }, 7]), [{ rows: "trasig" }, 7]);
  });
});

describe("leveransen utan personuppgifter", () => {
  const company: Delivery = {
    to: "customer",
    method: "pickup",
    address: { name: "Exempel AB", contactName: "Anna Lind", line1: "Storgatan 1", line2: null, zip: "111 22", city: "Stockholm", country: "SE", phone: "070-000 00 00" },
  };

  it("ett företags adress står kvar utan kontaktperson och telefon", () => {
    const erased = erasedDelivery(company, true);
    assert.deepEqual(erased, { ...company, address: { ...company.address, contactName: null, phone: null } });
    assert.equal(deliverySchema.safeParse(erased).success, true);
  });

  it("en privatpersons adress ersätts helt, men fraktsättet står kvar", () => {
    const erased = erasedDelivery({ ...company, address: { ...company.address, name: "Anna Lind" } }, false);
    assert.equal(erased?.method, "pickup");
    assert.equal(erased?.address.name, ERASED_CUSTOMER_NAME);
    assert.equal(JSON.stringify(erased).includes("Anna"), false);
    assert.equal(JSON.stringify(erased).includes("Storgatan"), false);
    assert.equal(JSON.stringify(erased).includes("111 22"), false);
    assert.equal(deliverySchema.safeParse(erased).success, true);
  });

  it("en leverans till återförsäljaren behåller adressen även när kunden saknar företag", () => {
    const erased = erasedDelivery({ ...company, to: "reseller" }, false);
    assert.equal(erased?.address.line1, "Storgatan 1");
    assert.equal(erased?.address.contactName, null);
    assert.equal(erased?.address.phone, null);
  });

  it("en order utan leverans förblir utan", () => {
    assert.equal(erasedDelivery(null, true), null);
  });
});

describe("meningen i bekräftelsen", () => {
  it("säger vad som tas bort och vad som behålls för en kund", () => {
    assert.equal(customerErasureSummary({ quotes: 0, designs: 0, ordersRemoved: 0, ordersKept: 0 }), "Kunden tas bort.");
    assert.equal(
      customerErasureSummary({ quotes: 2, designs: 0, ordersRemoved: 1, ordersKept: 1 }),
      "Kunden, 2 offerter och 1 order tas bort. 1 order behålls utan personuppgifter, eftersom den hör till bokföringen.",
    );
    assert.equal(
      customerErasureSummary({ quotes: 1, designs: 3, ordersRemoved: 0, ordersKept: 4 }),
      "Kunden, 1 offert och 3 mallar tas bort. 4 ordrar behålls utan personuppgifter, eftersom de hör till bokföringen.",
    );
  });

  it("säger vad som tas bort och vad som behålls för ett konto", () => {
    assert.equal(
      accountErasureSummary({ customers: 0, quotes: 0, designs: 0, ordersRemoved: 0, ordersKept: 0, shops: 0 }),
      "Kontot med inloggning och företagsuppgifter tas bort.",
    );
    assert.equal(
      accountErasureSummary({ customers: 3, quotes: 2, designs: 1, ordersRemoved: 5, ordersKept: 2, shops: 1 }),
      "Kontot med inloggning och företagsuppgifter, 3 kunder, 2 offerter, 1 mall, 5 ordrar och 1 butik tas bort. 2 ordrar behålls utan personuppgifter, eftersom de hör till bokföringen.",
    );
  });
});
