import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultContent, shopContentSchema } from "./content";
import { addBlock, addPage, duplicateBlock, moveBlock, movePage, removeBlock, removePage, renamePage, setText } from "./content-ops";

const valid = (content: unknown) => shopContentSchema.safeParse(content).success;

describe("editorns ändringar", () => {
  it("skriver text på rätt plats och inom gränsen", () => {
    let content = defaultContent();
    content = setText(content, "sa-funkar-det", "items.1.title", "Välj material");
    content = setText(content, "sa-funkar-det", "title", "x".repeat(500));
    const steps = content.pages[0]?.blocks[0];
    assert.equal(steps?.kind === "steps" ? steps.items[1]?.title : "", "Välj material");
    assert.equal(steps?.kind === "steps" ? steps.title.length : 0, 80);
    assert.ok(valid(content));
  });

  it("rör aldrig id och typ", () => {
    const content = setText(setText(defaultContent(), "sa-funkar-det", "id", "nytt"), "sa-funkar-det", "kind", "text");
    assert.equal(content.pages[0]?.blocks[0]?.id, "sa-funkar-det");
    assert.equal(content.pages[0]?.blocks[0]?.kind, "steps");
  });

  it("lägger till, kopierar, flyttar och tar bort block på en undersida", () => {
    const page = addPage(defaultContent(), "Om oss");
    assert.ok(page.pageId);
    const added = addBlock(page.content, page.pageId, "faq", 0);
    assert.ok(added.blockId);
    assert.equal(added.content.pages[1]?.blocks[0]?.kind, "faq");
    const copied = duplicateBlock(added.content, added.blockId);
    assert.equal(copied.content.pages[1]?.blocks.length, 4);
    const moved = moveBlock(copied.content, added.blockId, 3);
    assert.equal(moved.pages[1]?.blocks[3]?.id, added.blockId);
    const removed = removeBlock(moved, added.blockId);
    assert.equal(removed.pages[1]?.blocks.length, 3);
    assert.ok(valid(removed));
  });

  it("lägger aldrig till block på startsidan", () => {
    const content = defaultContent();
    assert.equal(addBlock(content, "start", "faq").blockId, null);
    assert.equal(duplicateBlock(content, "sa-funkar-det").blockId, null);
  });

  it("hanterar sidor men låter startsidan vara", () => {
    const one = addPage(defaultContent(), "Om oss");
    const two = addPage(one.content, "Kontakt");
    assert.ok(one.pageId && two.pageId);
    const renamed = renamePage(two.content, one.pageId, "Om företaget");
    assert.equal(renamed.pages[1]?.path, "om-foretaget");
    const reordered = movePage(renamed, two.pageId, 0);
    assert.equal(reordered.pages[1]?.id, two.pageId);
    assert.equal(reordered.pages[0]?.path, "");
    assert.equal(removePage(reordered, "start").pages.length, 3);
    assert.equal(removePage(reordered, two.pageId).pages.length, 2);
    assert.ok(valid(reordered));
  });
});
