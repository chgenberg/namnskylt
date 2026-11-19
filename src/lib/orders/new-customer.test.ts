import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newCustomerOf } from "./order-customer";

describe("en ny kund från skyltmotorn", () => {
  it("behöver kontaktperson och e-post på en order", () => {
    assert.deepEqual(newCustomerOf({ name: " Kim Ek ", email: " kim@exempel.se ", company: "Exempel AB", phone: "" }, false), {
      ok: true,
      customer: { name: "Kim Ek", email: "kim@exempel.se", company: "Exempel AB", phone: null },
    });
    assert.deepEqual(newCustomerOf({ company: "Exempel AB", email: "kim@exempel.se" }, false), { ok: false, error: "Ange kundens kontaktperson" });
    assert.deepEqual(newCustomerOf({ name: "Kim Ek", company: "Exempel AB" }, false), { ok: false, error: "Ange kundens e-postadress" });
  });

  it("får bara ha ett företagsnamn på en offert som säljaren skickar själv", () => {
    // E-posten sparas tom, och företagets namn står där kontaktpersonen saknas.
    assert.deepEqual(newCustomerOf({ company: " Exempel AB " }, true), {
      ok: true,
      customer: { name: "Exempel AB", email: "", company: "Exempel AB", phone: null },
    });
    assert.deepEqual(newCustomerOf({ name: "Kim Ek" }, true), { ok: true, customer: { name: "Kim Ek", email: "", company: null, phone: null } });
    // Det som ändå fylls i sparas.
    assert.deepEqual(newCustomerOf({ company: "Exempel AB", name: "Kim Ek", email: "kim@exempel.se", phone: "070-000 00 00" }, true), {
      ok: true,
      customer: { name: "Kim Ek", email: "kim@exempel.se", company: "Exempel AB", phone: "070-000 00 00" },
    });
    assert.deepEqual(newCustomerOf({ email: "kim@exempel.se" }, true), { ok: false, error: "Ange kundens företag eller namn" });
  });
});
