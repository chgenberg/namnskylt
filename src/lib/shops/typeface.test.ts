import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { engravingFontFor, shopTypeface, substituteFor } from "./typeface";

describe("butikens typsnitt", () => {
  it("laddar Google-typsnitt som de är", () => {
    const face = shopTypeface({ family: "Montserrat", google: true });
    assert.equal(face.webFamily, "Montserrat");
    assert.equal(face.substitute, false);
    assert.match(face.stack, /^"Montserrat", /);
  });

  it("ersätter kommersiella typsnitt med närmaste Google-familj och behåller originalet först", () => {
    const face = shopTypeface({ family: "Futura PT W01 Book", google: false });
    assert.equal(face.webFamily, "Jost");
    assert.equal(face.substitute, true);
    assert.match(face.stack, /^"Futura PT W01 Book", "Jost", /);
  });

  it("väljer smal ersättare för smala familjer", () => {
    assert.equal(substituteFor("Din-Condensed-Web"), "Barlow Condensed");
    assert.equal(substituteFor("AntennaExtraCond-Bold"), "Barlow Condensed");
    assert.equal(substituteFor("Din-Next-W01-Light"), "Barlow");
    assert.equal(substituteFor("Frutiger-Light"), "Hind");
    assert.equal(substituteFor("CircularStd-Bold"), "DM Sans");
    assert.equal(substituteFor("Butler Stencil Medium"), "Playfair Display");
  });

  it("använder systemets typsnitt — inte vårt — när inget hittades eller inget liknar", () => {
    assert.equal(shopTypeface({ family: null, google: false }).webFamily, null);
    assert.doesNotMatch(shopTypeface({ family: null, google: false }).stack, /geist/i);
    const unknown = shopTypeface({ family: "Edenred", google: false });
    assert.equal(unknown.webFamily, null);
    assert.match(unknown.stack, /^"Edenred", ui-sans-serif/);
  });

  it("graverar i Arial Narrow när sajtens typsnitt är smalt", () => {
    assert.equal(engravingFontFor({ family: "Oswald", google: true }), "arial-narrow");
    assert.equal(engravingFontFor({ family: "Antenna Cond", google: false }), "arial-narrow");
    assert.equal(engravingFontFor({ family: "Open Sans", google: true }), "arial");
    assert.equal(engravingFontFor(null), "arial");
  });
});
