import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resellerApplicationSchema, tenantSlug, type ResellerApplicationInput } from "./application-model";

const APPLICATION: ResellerApplicationInput = {
  company: "Exempelprofil AB",
  orgNumber: "556123-4567",
  contactName: "Anna Lind",
  email: "Anna@Example.se",
  phone: "070-123 45 67",
  address: "Storgatan 1\n111 22 Stockholm",
  website: "exempelprofil.se",
  message: "",
};

describe("ansökan om att bli återförsäljare", () => {
  it("godtar en ifylld ansökan och sparar e-posten med små bokstäver", () => {
    const parsed = resellerApplicationSchema.safeParse(APPLICATION);
    assert.equal(parsed.success && parsed.data.email, "anna@example.se");
  });

  it("organisationsnumret skrivs med eller utan bindestreck och sparas som 556123-4567", () => {
    for (const orgNumber of ["5561234567", "556123-4567", "556123 4567"]) {
      const parsed = resellerApplicationSchema.safeParse({ ...APPLICATION, orgNumber });
      assert.equal(parsed.success && parsed.data.orgNumber, "556123-4567", orgNumber);
    }
  });

  it("ett organisationsnummer som inte har tio siffror stoppas med ett begripligt fel", () => {
    for (const orgNumber of ["55612345", "55612345678", "abc"]) {
      const parsed = resellerApplicationSchema.safeParse({ ...APPLICATION, orgNumber });
      assert.equal(!parsed.success && parsed.error.issues[0]?.message, "Organisationsnumret ska ha tio siffror", orgNumber);
    }
  });

  it("företag, kontaktperson, e-post och fakturaadress krävs; telefon, hemsida och meddelande får vara tomma", () => {
    assert.equal(resellerApplicationSchema.safeParse({ ...APPLICATION, company: " " }).success, false);
    assert.equal(resellerApplicationSchema.safeParse({ ...APPLICATION, contactName: "" }).success, false);
    assert.equal(resellerApplicationSchema.safeParse({ ...APPLICATION, email: "inte en adress" }).success, false);
    assert.equal(resellerApplicationSchema.safeParse({ ...APPLICATION, address: "" }).success, false);
    assert.equal(resellerApplicationSchema.safeParse({ ...APPLICATION, phone: "", website: "", message: "" }).success, true);
  });
});

describe("kontots id ur företagsnamnet", () => {
  it("blir små bokstäver, siffror och bindestreck, utan å, ä och ö", () => {
    assert.equal(tenantSlug("Exempel & Söner AB"), "exempel-soner-ab");
    assert.equal(tenantSlug("  Åkes Skyltar  "), "akes-skyltar");
    assert.equal(tenantSlug("Café 24/7"), "cafe-24-7");
  });

  it("är högst 36 tecken och slutar aldrig med bindestreck", () => {
    const slug = tenantSlug("Ett Mycket Långt Företagsnamn Som Aldrig Tar Slut Aktiebolag");
    assert.ok(slug.length <= 36);
    assert.doesNotMatch(slug, /-$/);
    assert.match(slug, /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/);
  });

  it("ett namn utan användbara tecken ger ett neutralt id", () => {
    assert.equal(tenantSlug("!!!"), "aterforsaljare");
    assert.equal(tenantSlug("Å"), "aterforsaljare");
  });
});
