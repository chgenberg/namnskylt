import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { supplierUrl } from "./client";

describe("adressen till verkstadens API", () => {
  it("lägger vägen efter basadressens egen sökväg", () => {
    assert.equal(supplierUrl("https://www.skyltochgravyr.com/api/partner", "/orders"), "https://www.skyltochgravyr.com/api/partner/orders");
    assert.equal(supplierUrl("https://www.skyltochgravyr.com/api/partner/", "/orders/260123"), "https://www.skyltochgravyr.com/api/partner/orders/260123");
  });

  it("fungerar som förut för en basadress utan sökväg", () => {
    assert.equal(supplierUrl("http://localhost:4010", "/orders"), "http://localhost:4010/orders");
    assert.equal(supplierUrl("http://localhost:4010/", "/orders"), "http://localhost:4010/orders");
  });
});
