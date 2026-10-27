import assert from "node:assert/strict";
import { test } from "node:test";
import { INSPIRATION } from "@/features/inspiration/catalog";
import { badgeDocumentSchema } from "@/engine";

test("varje inspirationsskylt är ett giltigt dokument med foto och beskrivning", () => {
  assert.equal(INSPIRATION.length, 8);
  const slugs = new Set<string>();
  for (const entry of INSPIRATION) {
    assert.equal(badgeDocumentSchema.safeParse(entry.doc).success, true, entry.slug);
    assert.ok(entry.doc.logo, `${entry.slug} saknar logga`);
    assert.ok(entry.photo.endsWith(`/${entry.slug}.jpg`));
    assert.ok(entry.body.length > 80);
    slugs.add(entry.slug);
  }
  assert.equal(slugs.size, 8);
});
