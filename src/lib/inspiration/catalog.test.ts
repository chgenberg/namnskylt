import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { INSPIRATION } from "./catalog";
import { badgeDocumentSchema, isOfferedDocument } from "@/engine";

test("varje inspirationsskylt är ett giltigt dokument med foto och beskrivning", () => {
  assert.equal(INSPIRATION.length, 7);
  const slugs = new Set<string>();
  for (const entry of INSPIRATION) {
    assert.equal(badgeDocumentSchema.safeParse(entry.doc).success, true, entry.slug);
    // Skylten i egen form bär ingen logga: formen är det den visar.
    if (entry.doc.shape !== "custom") assert.ok(entry.doc.logo, `${entry.slug} saknar logga`);
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
  assert.equal(slugs.size, 7);
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
  const metal = INSPIRATION.filter((entry) => entry.doc.materialId === "metal");
  assert.equal(metal.length, 4);
  for (const entry of metal) {
    assert.doesNotMatch([entry.title, entry.lead].join(" "), /grav/i, entry.slug);
    assert.equal(entry.marking, "Endast print", entry.slug);
  }
});

test("de tre plastexemplen visar nål med gravyr, magnet med printad logga och en egen form", () => {
  const values = (slug: string) => {
    const entry = INSPIRATION.find((candidate) => candidate.slug === slug);
    return [...(entry?.details.map((detail) => detail.value) ?? []), entry?.marking];
  };
  assert.deepEqual(values("ica"), ["Röd / Vit · plast 1,5 mm", "Rektangel 75 × 25 mm", "Nål", "Endast gravyr"]);
  assert.deepEqual(values("ikea"), ["Gul / Svart · plast 1,5 mm", "Kudde 75 × 35 mm", "Magnet", "Namn graveras · logotyp printas"]);
  assert.deepEqual(values("bil"), ["Blå / Vit · plast 1,5 mm", "Egen form 92 × 44 mm", "Magnet", "Endast gravyr"]);
  // Loggan som printas är i en färg, så att länken "Gör en liknande" bär hela skylten utan en bild på servern.
  const ikea = INSPIRATION.find((entry) => entry.slug === "ikea")?.doc;
  assert.equal(ikea?.logo?.image, undefined);
  assert.equal(ikea?.printColor, "#0057B8");
  const car = INSPIRATION.find((entry) => entry.slug === "bil")?.doc;
  assert.equal(car?.shape, "custom");
  assert.ok((car?.customOutline?.length ?? 0) > 20);
});
