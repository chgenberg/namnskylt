import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument, outlinePath } from "@/engine";
import { toCubicPath } from "./cubic-path";

/** Det verkstadens vektorlager släpper igenom i en bana (deras `sanitizeVectorMarkup`). */
const WORKSHOP_PATH = /^[MLCZ0-9 .eE+-]*$/;

/** Banans segment som tal: `["M", 1, 2]`, `["C", …sex tal]`. */
function segments(d: string): [string, ...number[]][] {
  return [...d.matchAll(/([MLCZ])([^MLCZ]*)/g)].map(([, command, rest]) => [
    command as string,
    ...(rest ?? "").trim().split(/\s+/).filter(Boolean).map(Number),
  ]);
}

describe("banor för verkstadens vektorlager", () => {
  it("behåller raka banor och skriver relativa kommandon som absoluta", () => {
    assert.equal(toCubicPath("M1 2L3 4Z"), "M1 2L3 4Z");
    assert.equal(toCubicPath("M10 5h20v10h-20Z"), "M10 5L30 5L30 15L10 15Z");
    assert.equal(toCubicPath("M0 0H5V5l-5 0z"), "M0 0L5 0L5 5L0 5Z");
    // Flera punkter efter M är linjer.
    assert.equal(toCubicPath("M0 0 10 0 10 10"), "M0 0L10 0L10 10");
  });

  it("gör en kvadratisk kurva till samma kurva som kubisk", () => {
    const d = toCubicPath("M0 0Q10 20 20 0");
    assert.match(d, WORKSHOP_PATH);
    const [, curve] = segments(d);
    assert.deepEqual(curve, ["C", 6.667, 13.333, 13.333, 13.333, 20, 0]);
    // Mittpunkten är densamma: kvadratisk 0,25·p0 + 0,5·c + 0,25·p1 = (10, 10).
    const [, x1, y1, x2, y2, x3, y3] = curve as [string, number, number, number, number, number, number];
    assert.ok(Math.abs((3 * x1 + 3 * x2 + x3) / 8 - 10) < 0.001);
    assert.ok(Math.abs((3 * y1 + 3 * y2 + y3) / 8 - 10) < 0.001);
  });

  it("gör en båge till kubiska kurvor som följer cirkeln", () => {
    // Kvartsvarv med radien 10 kring (10, 10): från (10, 0) till (20, 10).
    const d = toCubicPath("M10 0a10 10 0 0 1 10 10");
    assert.match(d, WORKSHOP_PATH);
    const [, curve] = segments(d);
    const [, x1, y1, x2, y2, x3, y3] = curve as [string, number, number, number, number, number, number];
    assert.deepEqual([x3, y3], [20, 10]);
    // Kurvans mittpunkt ligger på cirkeln inom en tusendels millimeter.
    const mid = { x: (10 + 3 * x1 + 3 * x2 + x3) / 8, y: (0 + 3 * y1 + 3 * y2 + y3) / 8 };
    assert.ok(Math.abs(Math.hypot(mid.x - 10, mid.y - 10) - 10) < 0.003);
  });

  it("räknar om skyltens egna konturer: rundad rektangel och oval", () => {
    const rounded = toCubicPath(outlinePath({ ...createBadgeDocument(["Anna"]), shape: "rounded", cornerRadiusMm: 3 }));
    assert.match(rounded, WORKSHOP_PATH);
    assert.equal(segments(rounded).filter(([command]) => command === "C").length, 4);
    assert.ok(rounded.endsWith("Z"));
    const oval = toCubicPath(outlinePath({ ...createBadgeDocument(["Anna"]), shape: "oval", size: { widthMm: 70, heightMm: 40 } }));
    assert.match(oval, WORKSHOP_PATH);
    // Två halvvarv, vart och ett i två kvartsvarv.
    assert.equal(segments(oval).filter(([command]) => command === "C").length, 4);
    const xs = segments(oval).flatMap(([command, ...n]) => (command === "Z" ? [] : [n.at(-2) as number]));
    assert.equal(Math.min(...xs), 0);
    assert.equal(Math.max(...xs), 70);
  });

  it("stoppar på kommandon motorn inte skriver, i stället för att gissa", () => {
    assert.throws(() => toCubicPath("M0 0S1 1 2 2"), /Okänt path-kommando: S/);
    assert.throws(() => toCubicPath("M0 0T5 5"), /Okänt path-kommando: T/);
    assert.throws(() => toCubicPath("M0 0L1"), /Ogiltig path/);
  });

  it("stoppar på en trasig bana i stället för att fastna", () => {
    // Loggans mönster släpper igenom tal efter Z och tal före första kommandot.
    assert.throws(() => toCubicPath("M0 0L10 0L10 10Z5 5"), /Ogiltig path/);
    assert.throws(() => toCubicPath("5 5M0 0L1 1Z"), /Ogiltig path/);
    assert.throws(() => toCubicPath("M5Z"), /Ogiltig path/);
    // Flera slutna delbanor efter varandra är en vanlig, giltig logga.
    assert.equal(toCubicPath("M0 0L1 0L1 1ZM5 5L6 5L6 6Z"), "M0 0L1 0L1 1ZM5 5L6 5L6 6Z");
  });
});
