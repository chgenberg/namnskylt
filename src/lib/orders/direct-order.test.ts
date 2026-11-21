import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { customerGetsSiteMail, customerOrderNumber, isDirectOrder, isPlacedByCustomer } from "./model";

describe("vem verkstaden fakturerar", () => {
  it("en order hos namnskylt.com utan återförsäljare är en direktorder: kunden faktureras", () => {
    assert.equal(isDirectOrder({ resellerId: "namnskylt", payment: null }), true);
    assert.equal(isDirectOrder({ resellerId: "namnskylt" }), true);
  });

  it("en återförsäljares order faktureras alltid återförsäljaren", () => {
    assert.equal(isDirectOrder({ resellerId: "exempelprofil", payment: null }), false);
  });

  it("en order som redan är betald med kort faktureras inte kunden en gång till", () => {
    assert.equal(isDirectOrder({ resellerId: "namnskylt", payment: { provider: "stripe" } }), false);
  });
});

describe("ordernumret kunden ser", () => {
  /** En direktorder som verkstaden har tagit emot och gett sitt eget nummer. */
  const received = { orderNo: "NS-1200", resellerId: "namnskylt", payment: null, demo: false, supplierOrderNo: "48213", supplierSentAt: "2026-11-19T12:00:00.000Z" };

  it("är verkstadens nummer på en direktorder de har tagit emot, med vårt som referens", () => {
    assert.deepEqual(customerOrderNumber(received), { number: "48213", reference: "NS-1200" });
  });

  it("är vårt eget tills verkstaden har tagit emot ordern", () => {
    assert.deepEqual(customerOrderNumber({ ...received, supplierOrderNo: null, supplierSentAt: null }), { number: "NS-1200", reference: null });
    // Ett nummer utan att ordern är skickad räknas inte: det kan vara ett märke från demodata.
    assert.deepEqual(customerOrderNumber({ ...received, supplierSentAt: null }), { number: "NS-1200", reference: null });
    assert.deepEqual(customerOrderNumber({ ...received, supplierOrderNo: "  " }), { number: "NS-1200", reference: null });
  });

  it("är alltid vårt eget på en återförsäljares order: kunden ska inte möta verkstaden", () => {
    assert.deepEqual(customerOrderNumber({ ...received, resellerId: "exempelprofil" }), { number: "NS-1200", reference: null });
  });

  it("är vårt eget på en demoorder och på en order betald med kort", () => {
    assert.deepEqual(customerOrderNumber({ ...received, demo: true, supplierOrderNo: "DEMO" }), { number: "NS-1200", reference: null });
    assert.deepEqual(customerOrderNumber({ ...received, payment: { provider: "stripe" } }), { number: "NS-1200", reference: null });
  });
});

describe("sajtens egna mejl till kunden", () => {
  it("en kund som beställer i en återförsäljares butik får bekräftelse och fraktbesked härifrån", () => {
    assert.equal(customerGetsSiteMail({ resellerId: "exempelprofil", payment: null, source: "shop" }), true);
  });

  it("en direktorder får aldrig mejl härifrån: verkstadens system bekräftar den", () => {
    // Annars får kunden två bekräftelser, en från oss och en från Skylt & Gravyrteknik.
    assert.equal(customerGetsSiteMail({ resellerId: "namnskylt", payment: null, source: "web" }), false);
    // En butik utan ägare säljer åt namnskylt.com: också en direktorder.
    assert.equal(customerGetsSiteMail({ resellerId: "namnskylt", payment: null, source: "shop" }), false);
  });

  it("en order som säljaren har lagt åt kunden ger inget mejl till kunden", () => {
    for (const source of ["reseller", "quote", "repeat", "staff", "template"] as const) {
      assert.equal(isPlacedByCustomer(source), false, source);
      assert.equal(customerGetsSiteMail({ resellerId: "exempelprofil", payment: null, source }), false, source);
    }
  });

  it("en demoorder ger aldrig mejl", () => {
    assert.equal(customerGetsSiteMail({ resellerId: "exempelprofil", payment: null, source: "shop", demo: true }), false);
  });

  it("en order betald med kort hos namnskylt.com bekräftas härifrån, eftersom verkstaden då fakturerar oss", () => {
    assert.equal(customerGetsSiteMail({ resellerId: "namnskylt", payment: { provider: "stripe" }, source: "web" }), true);
  });
});
