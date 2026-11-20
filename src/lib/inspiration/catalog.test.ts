import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { INSPIRATION } from "./catalog";
import { badgeDocumentSchema, isOfferedDocument } from "@/engine";

test("varje inspirationsskylt är ett giltigt dokument med foto och beskrivning", () => {
  assert.equal(INSPIRATION.length, 4);
  const slugs = new Set<string>();
  for (const entry of INSPIRATION) {
    assert.equal(badgeDocumentSchema.safeParse(entry.doc).success, true, entry.slug);
    assert.ok(entry.doc.logo, `${entry.slug} saknar logga`);
    assert.ok(entry.photo.endsWith(`/${entry.slug}.jpg`));
    assert.ok(existsSync(`public${entry.photo}`), entry.photo);
    assert.ok(entry.lead.length > 40);
    // Tre närbilder per exempel: ytan, formen och fästet, var och en med sin bild.
    assert.deepEqual(entry.details.map((detail) => detail.label), ["Yta", "Form", "Fäste"], entry.slug);
    for (const detail of entry.details) {
      assert.ok(existsSync(`public${detail.image}`), detail.image);
      assert.ok(detail.value.length > 2 && detail.alt.length > 10, `${entry.slug} ${detail.label}`);
    }
    slugs.add(entry.slug);
  }
  assert.equal(slugs.size, 4);
});

test("varje exempel går att beställa i dag, så att Gör en liknande ger samma skylt", () => {
  for (const entry of INSPIRATION) assert.equal(isOfferedDocument(entry.doc), true, entry.slug);
});

test("texterna lovar inga material som inte säljs", () => {
  // Mässing är en av metallens ytor sedan 2026-11-17 och får nämnas. Borstat guld och silver finns inte längre.
  const old = /akryl|epoxy|gravyrplast|rostfri|borstat guld|borstat silver/i;
  for (const entry of INSPIRATION) {
    const text = [entry.title, entry.lead, ...entry.details.map((detail) => detail.value)].join(" ");
    assert.doesNotMatch(text, old, entry.slug);
  }
});

test("texten under närbilderna är läst ur skylten, och lovar ingen gravyr i metall", () => {
  const scandic = INSPIRATION.find((entry) => entry.slug === "scandic");
  assert.deepEqual(scandic?.details.map((detail) => detail.value), ["Mässing · metall 0,51 mm", "Rektangel 60 × 30 mm", "Magnet"]);
  const oval = INSPIRATION.find((entry) => entry.slug === "clas-ohlson");
  assert.deepEqual(oval?.details.map((detail) => detail.value), ["Nickel · metall 0,5 mm", "Oval 63 × 32 mm", "Nål"]);
  // Metallen printas: texterna får inte säga att skylten graveras.
  for (const entry of INSPIRATION) assert.doesNotMatch([entry.title, entry.lead].join(" "), /grav/i, entry.slug);
});
