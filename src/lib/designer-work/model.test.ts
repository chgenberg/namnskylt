import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBadgeDocument, toOfferedDocument, withTexts, type BadgeDocument, type BadgeLogo } from "@/engine";
import {
  SAVED_WORK_MAX_AGE_MS,
  isSaveable,
  isWorthSaving,
  openedWith,
  packSavedWork,
  readSavedWork,
  restoredWork,
  savedWorkKey,
  type SavedWork,
} from "./model";

const NOW = Date.parse("2026-11-15T12:00:00Z");
const badge = (...texts: string[]): BadgeDocument => toOfferedDocument(createBadgeDocument(texts));
const logo: BadgeLogo = { d: "M0 0L10 0L10 10L0 10Z", viewWidth: 10, viewHeight: 10, placement: "left", heightMm: 8 };
const anna = badge("Anna Lind", "Säljare");
const work = (patch: Partial<SavedWork> = {}): SavedWork => ({ doc: anna, batchText: "", cart: [], pending: false, opened: "", ...patch });
const roundTrip = (saved: SavedWork) => readSavedWork(packSavedWork(saved, NOW), NOW);

describe("nyckeln för det sparade arbetet", () => {
  it("skiljer webben, varje butik och varje kund och läge åt", () => {
    const keys = [
      savedWorkKey({ kind: "web" }),
      savedWorkKey({ kind: "shop", slug: "exempelbutik" }),
      savedWorkKey({ kind: "shop", slug: "annan-butik" }),
      savedWorkKey({ kind: "reseller", customerId: "k1", mode: "order" }),
      savedWorkKey({ kind: "reseller", customerId: "k1", mode: "quote" }),
      savedWorkKey({ kind: "reseller", customerId: "k2", mode: "order" }),
    ];
    assert.equal(new Set(keys).size, keys.length);
    assert.ok(keys.every((key) => key.startsWith("namnskylt:skyltmotor:v1:")));
  });
});

describe("det sparade arbetet", () => {
  it("kommer tillbaka som det sparades: skylten, namnlistan, varukorgen och den nya skylten", () => {
    const saved = work({
      doc: withTexts(anna, [""]),
      batchText: "",
      cart: [{ doc: anna, batchText: "Bo Ek, Kock\nCia Dal" }, { doc: { ...badge("Dan Ro"), quantity: 3 }, batchText: "" }],
      pending: true,
    });
    assert.deepEqual(roundTrip(saved), saved);
    assert.deepEqual(roundTrip(work({ batchText: "Bo Ek" })), work({ batchText: "Bo Ek" }));
  });

  it("sparar samma logga en gång, hur många designer som än bär den", () => {
    const withLogo = { ...anna, logo };
    const saved = work({ doc: withLogo, cart: [{ doc: withLogo, batchText: "" }, { doc: { ...badge("Bo Ek"), logo }, batchText: "" }] });
    const packed = packSavedWork(saved, NOW);
    assert.equal(packed.split(logo.d).length - 1, 1);
    assert.deepEqual(roundTrip(saved), saved);
    // En annan logga får en egen plats.
    const other = { ...logo, d: "M0 0L5 0L5 5Z" };
    const two = work({ doc: withLogo, cart: [{ doc: { ...anna, logo: other }, batchText: "" }] });
    assert.deepEqual(roundTrip(two), two);
  });

  it("sparas inte när det inte finns något att spara", () => {
    assert.equal(isWorthSaving(work({ doc: badge("") })), false);
    assert.equal(isWorthSaving(work({ doc: badge(""), batchText: "Bo Ek" })), true);
    assert.equal(isWorthSaving(work({ doc: { ...badge(""), logo } })), true);
    assert.equal(isWorthSaving(work({ doc: badge(""), cart: [{ doc: anna, batchText: "" }], pending: true })), true);
    assert.equal(roundTrip(work({ doc: badge("") })), null);
  });

  it("kastas när det är för gammalt, trasigt eller av en annan version", () => {
    const packed = packSavedWork(work(), NOW);
    assert.ok(readSavedWork(packed, NOW + SAVED_WORK_MAX_AGE_MS));
    assert.equal(readSavedWork(packed, NOW + SAVED_WORK_MAX_AGE_MS + 1), null);
    assert.equal(readSavedWork(null, NOW), null);
    assert.equal(readSavedWork("", NOW), null);
    assert.equal(readSavedWork("{inte json", NOW), null);
    assert.equal(readSavedWork(JSON.stringify({ v: 1 }), NOW), null);
    assert.equal(readSavedWork(packed.replace('"v":1', '"v":2'), NOW), null);
    // En logga som pekas ut men saknas i listan.
    assert.equal(readSavedWork(JSON.stringify({ ...JSON.parse(packed), editor: { doc: anna, logo: 3 } }), NOW), null);
  });

  it("kastas helt när en enda skylt inte går att läsa eller inte säljs längre", () => {
    const old = { ...anna, materialId: "brass" } as unknown as BadgeDocument;
    const broken = { ...anna, size: { widthMm: -1, heightMm: 25 } };
    for (const bad of [old, broken]) {
      assert.equal(roundTrip(work({ doc: bad })), null);
      assert.equal(roundTrip(work({ cart: [{ doc: anna, batchText: "" }, { doc: bad, batchText: "" }] })), null);
    }
  });

  it("sparar en skylt utan text, men inte en som är ogiltig mitt i en ändring", () => {
    const blank = withTexts(anna, [""]);
    assert.equal(isSaveable(work({ doc: blank, cart: [{ doc: anna, batchText: "" }], pending: true })), true);
    assert.equal(isSaveable(work({ doc: { ...anna, size: { widthMm: -1, heightMm: 25 } } })), false);
    assert.equal(isSaveable(work({ cart: [{ doc: { ...anna, materialId: "brass" } as unknown as BadgeDocument, batchText: "" }] })), false);
    // Texten kommer tillbaka som den var, även blanktecken.
    const spaced = { ...blank, rows: blank.rows.map((row) => ({ ...row, text: "  " })) };
    assert.deepEqual(roundTrip(work({ doc: spaced, batchText: "Bo Ek" }))?.doc, spaced);
  });

  it("har ingen ny och orörd skylt utan en varukorg", () => {
    assert.equal(roundTrip(work({ pending: true }))?.pending, false);
  });
});

describe("vad som läses tillbaka när skyltmotorn öppnas", () => {
  const bo = badge("Bo Ek");
  const cart = [{ doc: bo, batchText: "Cia Dal" }];
  const eva = badge("Eva Ny");
  const fromStart = openedWith("Eva Ny", null);

  it("är allt som det var, när inget står i adressen", () => {
    assert.deepEqual(restoredWork(work(), null, ""), { work: work(), notice: "badge", editor: "saved" });
    assert.deepEqual(restoredWork(work({ cart }), null, ""), { work: work({ cart }), notice: "cart", editor: "saved" });
  });

  it("är allt som det var, när sidan laddas om med samma text eller länk i adressen", () => {
    // Kunden kom från startsidan med ett namn, bytte material och laddade om sidan.
    const changed = { ...anna, mounting: "magnet" as const };
    const saved = work({ doc: changed, opened: openedWith("Anna Lind", null) });
    const restored = restoredWork(saved, badge("Anna Lind"), openedWith("Anna Lind", null));
    assert.deepEqual(restored, { work: saved, notice: "badge", editor: "saved" });
    assert.equal(openedWith("  Anna Lind ", null), openedWith("Anna Lind", null));
    assert.equal(openedWith("", null), "");
    assert.notEqual(openedWith("Anna Lind", null), openedWith("", anna));
  });

  it("är ingenting, när kunden börjar på en ny skylt och aldrig hade en varukorg", () => {
    assert.equal(restoredWork(work(), eva, fromStart), null);
  });

  it("är varukorgen och skylten som låg i editorn, när kunden kommer med en ny skylt", () => {
    const restored = restoredWork(work({ cart, batchText: "Fia Ek" }), eva, fromStart);
    assert.equal(restored?.notice, "cart");
    assert.equal(restored?.editor, "incoming");
    assert.deepEqual(restored?.work, { doc: eva, batchText: "", cart: [...cart, { doc: anna, batchText: "Fia Ek" }], pending: false, opened: fromStart });
  });

  it("tar inte med skylten i editorn när den var ny och orörd", () => {
    const restored = restoredWork(work({ doc: withTexts(anna, [""]), cart, pending: true }), eva, fromStart);
    assert.deepEqual(restored?.work.cart, cart);
    assert.equal(restored?.work.doc, eva);
  });

  it("lägger aldrig samma skylt två gånger i ordern, till exempel efter en avbruten kortbetalning", () => {
    // Länken tillbaka bär orderns första skylt: den första i varukorgen, med loggan omgjord på vägen.
    const saved = work({ cart: [{ doc: { ...bo, logo }, batchText: "Cia Dal" }], opened: "t:Anna Lind" });
    const link = openedWith("", bo);
    assert.deepEqual(restoredWork(saved, bo, link), { work: { ...saved, opened: link }, notice: "cart", editor: "saved" });
    // Ett namn ur namnlistan känns också igen.
    const cia = withTexts(bo, ["Cia Dal"]);
    assert.equal(restoredWork(saved, cia, openedWith("", cia))?.editor, "saved");
    // Utan varukorg är länkens skylt den som låg i editorn: inget synligt ändras, så inget sägs.
    const annaLink = openedWith("", anna);
    assert.deepEqual(restoredWork(work(), { ...anna }, annaLink), { work: work({ opened: annaLink }), notice: null, editor: "saved" });
    assert.equal(restoredWork(work({ batchText: "Bo Ek" }), anna, annaLink)?.notice, "badge");
  });

  it("räknar en skylt med annat antal eller material som en annan skylt", () => {
    const more = { ...anna, quantity: anna.quantity + 1 };
    assert.equal(restoredWork(work(), more, openedWith("", more)), null);
  });
});
