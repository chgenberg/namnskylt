import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FLICK_PX_PER_MS, clampSheetHeight, nextSheetStop, snapSheet } from "./stops";

const heights = { small: 180, half: 420, full: 700 };

describe("bladet på telefon", () => {
  it("ett tryck på greppet stegar litet, halvt, helt och tillbaka", () => {
    assert.equal(nextSheetStop("small"), "half");
    assert.equal(nextSheetStop("half"), "full");
    assert.equal(nextSheetStop("full"), "small");
  });

  it("ett lugnt drag stannar i läget som ligger närmast", () => {
    assert.equal(snapSheet({ from: "small", height: 250, velocity: 0.1, heights }), "small");
    assert.equal(snapSheet({ from: "small", height: 380, velocity: 0.1, heights }), "half");
    assert.equal(snapSheet({ from: "half", height: 600, velocity: 0, heights }), "full");
    assert.equal(snapSheet({ from: "full", height: 330, velocity: -0.2, heights }), "half");
  });

  it("ett snabbt drag går ett läge åt sitt håll från där det började", () => {
    assert.equal(snapSheet({ from: "small", height: 200, velocity: FLICK_PX_PER_MS, heights }), "half");
    assert.equal(snapSheet({ from: "half", height: 430, velocity: 2, heights }), "full");
    assert.equal(snapSheet({ from: "full", height: 690, velocity: -1, heights }), "half");
    assert.equal(snapSheet({ from: "half", height: 410, velocity: -1, heights }), "small");
  });

  it("ett snabbt drag stannar vid ändarna", () => {
    assert.equal(snapSheet({ from: "full", height: 700, velocity: 3, heights }), "full");
    assert.equal(snapSheet({ from: "small", height: 180, velocity: -3, heights }), "small");
  });

  it("draget håller sig mellan bladets minsta och största höjd", () => {
    assert.equal(clampSheetHeight(50, heights), 180);
    assert.equal(clampSheetHeight(500, heights), 500);
    assert.equal(clampSheetHeight(900, heights), 700);
  });
});
