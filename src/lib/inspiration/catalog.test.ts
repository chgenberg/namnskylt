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
    assert.ok(existsSync(`public${entry.badgePhoto}`), entry.badgePhoto);
    assert.ok(entry.body.length > 80);
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
    const text = [entry.title, entry.lead, entry.body, ...entry.highlights].join(" ");
    assert.doesNotMatch(text, old, entry.slug);
  }
});
