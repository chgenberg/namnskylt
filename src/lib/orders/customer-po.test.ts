import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CUSTOMER_PO_MAX, cleanCustomerPo, customerPoSchema } from "./customer-po";

describe("beställarens eget inköpsnummer", () => {
  it("sparas som en rad utan luft i kanterna, och tomt är inget nummer", () => {
    assert.equal(cleanCustomerPo("  4500 012345  "), "4500 012345");
    assert.equal(cleanCustomerPo("PO-77\n\tAvd 3"), "PO-77 Avd 3");
    assert.equal(cleanCustomerPo(""), null);
    assert.equal(cleanCustomerPo("   "), null);
    assert.equal(cleanCustomerPo(null), null);
    assert.equal(cleanCustomerPo(undefined), null);
  });

  it("kortas till det som ryms", () => {
    assert.equal(cleanCustomerPo("9".repeat(80))?.length, CUSTOMER_PO_MAX);
    assert.equal(customerPoSchema.safeParse("9".repeat(CUSTOMER_PO_MAX)).success, true);
    assert.equal(customerPoSchema.safeParse("9".repeat(CUSTOMER_PO_MAX + 1)).success, false);
    // Fältet är frivilligt.
    assert.equal(customerPoSchema.safeParse(undefined).success, true);
  });
});
