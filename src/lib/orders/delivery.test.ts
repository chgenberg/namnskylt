import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addressFromDraft,
  deliveryLines,
  deliveryPhoneIssue,
  deliverySchema,
  draftForRecipient,
  draftFromAddress,
  EMPTY_DELIVERY_DRAFT,
  guessAddress,
  needsPhone,
  parseDelivery,
  PHONE_INVALID_TEXT,
  PHONE_REQUIRED_TEXT,
  parseQuoteDelivery,
  shippingAddressFromDraft,
  shippingMethodOf,
  shippingNote,
  type DeliveryAddress,
} from "./delivery";

const ADDRESS: DeliveryAddress = {
  name: "Hotell Exempel AB",
  contactName: "Anna Lind",
  line1: "Storgatan 1",
  line2: null,
  zip: "111 22",
  city: "Stockholm",
  country: "SE",
  phone: "070-123 45 67",
};

describe("leveransadressen", () => {
  it("postnumret skrivs med eller utan mellanslag och sparas som 123 45", () => {
    for (const zip of ["11122", "111 22", " 111  22 "]) {
      const parsed = addressFromDraft({ ...draftFromAddress(ADDRESS), zip });
      assert.equal(parsed.ok && parsed.address.zip, "111 22", zip);
    }
  });

  it("ett postnummer som inte har fem siffror stoppas med ett begripligt fel", () => {
    for (const zip of ["1112", "111222", "abc 12", ""]) {
      const parsed = addressFromDraft({ ...draftFromAddress(ADDRESS), zip });
      assert.deepEqual(parsed, { ok: false, error: "Postnumret ska ha fem siffror" }, zip);
    }
  });

  it("en leverans som fraktas kräver telefon; den som hämtar själv behöver ingen", () => {
    assert.equal(needsPhone("standard"), true);
    assert.equal(needsPhone("express"), true);
    assert.equal(needsPhone("pickup"), false);
    // En leverans utan valt fraktsätt har standardfrakt.
    assert.equal(needsPhone(undefined), true);
    const withoutPhone = { ...draftFromAddress(ADDRESS), phone: " " };
    assert.deepEqual(shippingAddressFromDraft(withoutPhone, "standard"), { ok: false, error: PHONE_REQUIRED_TEXT });
    assert.deepEqual(shippingAddressFromDraft(withoutPhone, "express"), { ok: false, error: PHONE_REQUIRED_TEXT });
    // Utan fraktsätt gäller standardfrakt, här som överallt annars.
    assert.deepEqual(shippingAddressFromDraft(withoutPhone, undefined), { ok: false, error: PHONE_REQUIRED_TEXT });
    assert.equal(shippingAddressFromDraft(withoutPhone, "pickup").ok, true);
    assert.equal(shippingAddressFromDraft(draftFromAddress(ADDRESS), "standard").ok, true);
    // Övriga fel visas först: telefonen prövas på en adress som annars är hel.
    assert.deepEqual(shippingAddressFromDraft({ ...withoutPhone, line1: "" }, "standard"), { ok: false, error: "Gatuadress krävs" });
  });

  it("ett streck eller några ord är inget telefonnummer", () => {
    for (const phone of ["-", "vet ej", "ring växeln", "12345"]) {
      assert.equal(deliveryPhoneIssue({ phone }, "standard"), PHONE_INVALID_TEXT, phone);
    }
    for (const phone of ["070-123 45 67", "+46 (0)70 123 45 67", "08-12 34 56", "0123-123 45", "växel 031-12 34 56, anknytning 12"]) {
      assert.equal(deliveryPhoneIssue({ phone }, "express"), null, phone);
    }
    // Vid upphämtning prövas inte numret alls.
    assert.equal(deliveryPhoneIssue({ phone: "-" }, "pickup"), null);
    assert.deepEqual(shippingAddressFromDraft({ ...draftFromAddress(ADDRESS), phone: "vet ej" }, "standard"), { ok: false, error: PHONE_INVALID_TEXT });
  });

  it("servern prövar samma regel för en ny leverans, och låter äldre leveranser vara", () => {
    assert.equal(deliveryPhoneIssue({ phone: null }, "standard"), PHONE_REQUIRED_TEXT);
    assert.equal(deliveryPhoneIssue({ phone: "" }, undefined), PHONE_REQUIRED_TEXT);
    assert.equal(deliveryPhoneIssue({ phone: null }, "pickup"), null);
    assert.equal(deliveryPhoneIssue({ phone: "070-123 45 67" }, "express"), null);
    // Ingen adress att pröva (en offert där kunden fyller i den senare).
    assert.equal(deliveryPhoneIssue(null, "standard"), null);
    // En sparad leverans utan telefon läses fortfarande: verkstaden bokar då frakten för hand.
    assert.equal(parseDelivery({ to: "customer", address: { ...ADDRESS, phone: null } })?.address.phone, null);
    // Den vanliga tolkningen prövar aldrig telefonen: den läser också adresser som bara ska fyllas i förväg.
    assert.equal(addressFromDraft({ ...draftFromAddress(ADDRESS), phone: "" }).ok, true);
  });

  it("mottagare, gatuadress och ort krävs; kontakt, andra raden och telefon får vara tomma", () => {
    assert.deepEqual(addressFromDraft({ ...draftFromAddress(ADDRESS), name: " " }), { ok: false, error: "Mottagare krävs" });
    assert.deepEqual(addressFromDraft({ ...draftFromAddress(ADDRESS), line1: "" }), { ok: false, error: "Gatuadress krävs" });
    assert.deepEqual(addressFromDraft({ ...draftFromAddress(ADDRESS), city: "" }), { ok: false, error: "Ort krävs" });
    const minimal = addressFromDraft({ ...EMPTY_DELIVERY_DRAFT, name: "Anna Lind", line1: "Storgatan 1", zip: "11122", city: "Stockholm" });
    assert.deepEqual(minimal, {
      ok: true,
      address: { name: "Anna Lind", contactName: null, line1: "Storgatan 1", line2: null, zip: "111 22", city: "Stockholm", country: "SE", phone: null },
    });
  });

  it("ett formulär fyllt ur en sparad adress ger samma adress tillbaka", () => {
    assert.deepEqual(addressFromDraft(draftFromAddress(ADDRESS)), { ok: true, address: ADDRESS });
    assert.deepEqual(draftFromAddress(null), EMPTY_DELIVERY_DRAFT);
  });

  it("skrivs som rader på en fraktsedel, utan tomma rader", () => {
    assert.deepEqual(deliveryLines(ADDRESS), ["Hotell Exempel AB", "Att: Anna Lind", "Storgatan 1", "111 22 Stockholm", "070-123 45 67"]);
    assert.deepEqual(deliveryLines({ ...ADDRESS, contactName: null, phone: null, line2: "Plan 3" }), [
      "Hotell Exempel AB",
      "Storgatan 1",
      "Plan 3",
      "111 22 Stockholm",
    ]);
  });
});

describe("adress skriven som fri text", () => {
  it("två rader blir gatuadress, postnummer och ort", () => {
    assert.deepEqual(guessAddress("Storgatan 1\n111 22 Stockholm"), { line1: "Storgatan 1", line2: "", zip: "111 22", city: "Stockholm" });
  });

  it("en rad med kommatecken tolkas likadant, även utan mellanslag i postnumret", () => {
    assert.deepEqual(guessAddress("Storgatan 1, 11122 Stockholm"), { line1: "Storgatan 1", line2: "", zip: "111 22", city: "Stockholm" });
  });

  it("en extra rad före postnumret blir adressens andra rad, och orten får ha flera ord", () => {
    assert.deepEqual(guessAddress("Box 12\nStorgatan 1\n431 53 Västra Frölunda"), {
      line1: "Box 12",
      line2: "Storgatan 1",
      zip: "431 53",
      city: "Västra Frölunda",
    });
  });

  it("det som inte går att tolka lämnas tomt", () => {
    assert.deepEqual(guessAddress("Storgatan 1"), { line1: "Storgatan 1", line2: "", zip: "", city: "" });
    assert.deepEqual(guessAddress(null), { line1: "", line2: "", zip: "", city: "" });
  });

  it("ett företag blir mottagare med personen som kontakt; utan företag är personen mottagare", () => {
    const company = draftForRecipient({ name: "Anna Lind", company: "Hotell Exempel AB", phone: "070-123 45 67", address: "Storgatan 1\n111 22 Stockholm" });
    assert.deepEqual(company, {
      name: "Hotell Exempel AB",
      contactName: "Anna Lind",
      line1: "Storgatan 1",
      line2: "",
      zip: "111 22",
      city: "Stockholm",
      phone: "070-123 45 67",
    });
    assert.deepEqual(draftForRecipient({ name: "Anna Lind" }), { ...EMPTY_DELIVERY_DRAFT, name: "Anna Lind" });
  });
});

describe("sparad leverans", () => {
  it("en order utan leverans, eller med en trasig, läses som ingen", () => {
    assert.equal(parseDelivery(null), null);
    assert.equal(parseDelivery({ to: "customer" }), null);
    assert.equal(parseDelivery({ to: "någon", address: ADDRESS }), null);
    assert.deepEqual(parseDelivery({ to: "reseller", address: ADDRESS }), { to: "reseller", address: ADDRESS });
  });

  it("en offert från före leveransadressen går till kunden, som fyller i adressen", () => {
    assert.deepEqual(parseQuoteDelivery(null), { to: "customer", address: null });
    assert.deepEqual(parseQuoteDelivery({ to: "reseller", address: ADDRESS }), { to: "reseller", address: ADDRESS });
  });

  it("fraktsättet följer med leveransen, och en leverans utan det har standardfrakt", () => {
    assert.equal(shippingMethodOf(parseDelivery({ to: "customer", address: ADDRESS })), "standard");
    assert.equal(shippingMethodOf(null), "standard");
    assert.equal(shippingMethodOf(parseDelivery({ to: "customer", address: ADDRESS, method: "pickup" })), "pickup");
    assert.equal(shippingMethodOf(parseQuoteDelivery({ to: "customer", address: null, method: "express" })), "express");
    assert.equal(deliverySchema.safeParse({ to: "customer", address: ADDRESS, method: "drönare" }).success, false);
  });

  it("express och upphämtning får en egen fraktrad, utan verkstadens namn eller adress", () => {
    assert.equal(shippingNote("standard"), null);
    assert.deepEqual(shippingNote("express"), { label: "Frakt, express", value: "tillkommer" });
    assert.deepEqual(shippingNote("pickup"), { label: "Frakt, hämtas", value: "0 kr" });
  });

  it("schemat godtar inga andra länder än Sverige", () => {
    assert.equal(deliverySchema.safeParse({ to: "customer", address: { ...ADDRESS, country: "NO" } }).success, false);
  });
});
