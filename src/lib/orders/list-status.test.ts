import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ORDER_STATUSES } from "./model";
import { inOrderListFilter, isOrderListFilter, orderListStatus } from "./list-status";

const sent = { demo: false, atWorkshop: true };
const stuck = { demo: false, atWorkshop: false };

describe("orderns läge i panelens listor", () => {
  it("allt före utskicket är I produktion, och skickat och levererat är Skickad", () => {
    for (const status of ["received", "proof-sent", "approved", "in-production"] as const) assert.equal(orderListStatus(status, sent), "in-production", status);
    for (const status of ["shipped", "delivered"] as const) assert.equal(orderListStatus(status, sent), "shipped", status);
    assert.equal(orderListStatus("cancelled", sent), "cancelled");
  });

  it("en order som inte har gått till tillverkningen kallas aldrig I produktion", () => {
    for (const status of ["received", "proof-sent", "approved"] as const) assert.equal(orderListStatus(status, stuck), "waiting", status);
    // Satt för hand till tillverkning, eller skickad: då gäller statusen.
    assert.equal(orderListStatus("in-production", stuck), "in-production");
    assert.equal(orderListStatus("shipped", stuck), "shipped");
    // En demoorder skickas aldrig och ska inte se ut att ha fastnat.
    assert.equal(orderListStatus("received", { demo: true, atWorkshop: false }), "in-production");
  });

  it("varje order syns utan filter, och under högst ett av de två filtren", () => {
    for (const status of ORDER_STATUSES) {
      for (const where of [sent, stuck]) {
        const shown = orderListStatus(status, where);
        assert.equal(inOrderListFilter(shown, null), true);
        const hits = [inOrderListFilter(shown, "in-production"), inOrderListFilter(shown, "shipped")].filter(Boolean).length;
        assert.equal(hits, shown === "cancelled" ? 0 : 1, `${status} ${shown}`);
      }
    }
    // En order som väntar står under I produktion, så att den inte försvinner ur det som inte är skickat.
    assert.equal(inOrderListFilter("waiting", "in-production"), true);
  });

  it("bara de två filtren går att välja i adressen", () => {
    assert.equal(isOrderListFilter("in-production"), true);
    assert.equal(isOrderListFilter("shipped"), true);
    for (const value of ["open", "all", "received", "delivered", "", undefined]) assert.equal(isOrderListFilter(value), false, String(value));
  });
});
