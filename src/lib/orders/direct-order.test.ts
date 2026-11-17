import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isDirectOrder } from "./model";

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
