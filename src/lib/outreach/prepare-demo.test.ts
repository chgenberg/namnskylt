import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { groupByWebsite, isOutreachPreviewShop, pickDemoSource, sourceHost } from "./demo-source";

describe("pickDemoSource", () => {
  test("webbplatsen blir källan med samma värdnamn som butikerna sparar", () => {
    assert.deepEqual(pickDemoSource({ website: "https://www.Profilab.se/" }), {
      kind: "website",
      url: "https://profilab.se",
      host: "profilab.se",
    });
  });

  test("utan webbplats blir det en skalbutik", () => {
    assert.deepEqual(pickDemoSource({ website: null }), { kind: "shell" });
    assert.deepEqual(pickDemoSource({ website: "inte en adress" }), { kind: "shell" });
  });

  test("värdnamnet tål adresser utan protokoll", () => {
    assert.equal(sourceHost("profilab.se/om-oss"), "profilab.se");
    assert.equal(sourceHost("localhost"), null);
  });
});

describe("orderspärren", () => {
  test("en ägarlös butik från ett utskick tar inte emot order", () => {
    assert.equal(isOutreachPreviewShop({ ownerId: null, hasOutreachLead: true }), true);
  });

  test("en aktiverad butik och vanliga demobutiker tar emot order", () => {
    assert.equal(isOutreachPreviewShop({ ownerId: "acc_1", hasOutreachLead: true }), false);
    assert.equal(isOutreachPreviewShop({ ownerId: null, hasOutreachLead: false }), false);
  });
});

describe("groupByWebsite", () => {
  test("kontakter på samma webbplats hamnar i samma grupp", () => {
    const groups = groupByWebsite([
      { id: "a", website: "https://www.profilab.se" },
      { id: "b", website: "annan.se" },
      { id: "c", website: "profilab.se/kontakt" },
      { id: "d", website: null },
      { id: "e", website: null },
    ]);
    assert.deepEqual(
      groups.map((group) => group.map((lead) => lead.id)),
      [["a", "c"], ["b"], ["d"], ["e"]],
    );
  });
});
