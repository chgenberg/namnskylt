import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { repairAiContent } from "./content-repair";

const images = new Set(["bildbildbild01"]);

describe("AI:ns förslag", () => {
  it("lagar id:n, adresser och okända bilder", () => {
    const content = repairAiContent(
      {
        pages: [
          { id: "start", path: "fel", label: "Hem", blocks: [{ kind: "text", id: "x", title: "Hej", text: "Text" }] },
          {
            id: "start",
            path: "Om Oss!",
            label: "Om oss",
            blocks: [
              { kind: "imageText", id: "bild1", imageId: "pahittad123456", imageSide: "left", title: "A", text: "B", buttonLabel: "", buttonHref: "" },
              { kind: "gallery", id: "bild1", title: "G", images: ["bildbildbild01", "pahittad123456"] },
            ],
          },
        ],
      },
      images,
    );
    assert.ok(content);
    assert.equal(content.pages[0]?.path, "");
    assert.equal(content.pages[1]?.path, "om-oss");
    assert.notEqual(content.pages[0]?.id, content.pages[1]?.id);
    const [imageText, gallery] = content.pages[1]?.blocks ?? [];
    assert.equal(imageText?.kind === "imageText" ? imageText.imageId : "x", null);
    assert.deepEqual(gallery?.kind === "gallery" ? gallery.images : [], ["bildbildbild01"]);
    assert.notEqual(imageText?.id, gallery?.id);
  });

  it("avvisar förslag som inte håller", () => {
    assert.equal(repairAiContent(null, images), null);
    assert.equal(repairAiContent({ pages: [] }, images), null);
    assert.equal(
      repairAiContent({ pages: [{ id: "start", path: "", label: "Hem", blocks: [{ kind: "banner", id: "b1", text: "x", href: "javascript:1", until: "" }] }] }, images),
      null,
    );
  });
});
