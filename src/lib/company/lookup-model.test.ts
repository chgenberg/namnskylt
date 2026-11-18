import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { companyFromVies, filled, lookupNumber, parseRegisterAddress, vatNumberOf, viesUnavailable, withCompanyAddress } from "./lookup-model";

describe("numret som får slås upp", () => {
  test("ett organisationsnummer för en juridisk person, hur det än är skrivet", () => {
    assert.equal(lookupNumber("556123-4567"), "5561234567");
    assert.equal(lookupNumber(" 5561234567 "), "5561234567");
    assert.equal(lookupNumber("SE556123456701"), "5561234567");
    assert.equal(lookupNumber("16556123-4567"), "5561234567");
    assert.equal(lookupNumber("802001-2345"), "8020012345");
  });

  test("ett ofullständigt eller felaktigt nummer slås inte upp", () => {
    for (const text of ["", "55612", "556123-456", "abc", null, undefined]) assert.equal(lookupNumber(text), null);
  });

  test("en enskild firmas nummer är ägarens personnummer och lämnar aldrig sajten", () => {
    // Månaden i ett personnummer är 01–12, så tredje siffran är 0 eller 1.
    assert.equal(lookupNumber("850412-1234"), null);
    assert.equal(lookupNumber("19850412-1234"), null);
    assert.equal(lookupNumber("701130-5678"), null);
  });

  test("momsnumret är organisationsnumret följt av 01", () => {
    assert.equal(vatNumberOf("5561234567"), "556123456701");
  });
});

describe("adressen ur registret", () => {
  test("gata, postnummer och ort, med läsbara bokstäver", () => {
    assert.deepEqual(parseRegisterAddress("STORGATAN 12 \n123 45 VÄSTRA EXEMPELSTAD"), {
      line1: "Storgatan 12",
      line2: "",
      zip: "123 45",
      city: "Västra Exempelstad",
    });
  });

  test("en adress med bara postnummer och ort", () => {
    assert.deepEqual(parseRegisterAddress("12345 EXEMPELSTAD"), { line1: "", line2: "", zip: "123 45", city: "Exempelstad" });
  });

  test("c/o hamnar på andra raden, och gatan på första", () => {
    assert.deepEqual(parseRegisterAddress("c/o Exempel AB, Ekonomi \nHus 9 \n543 21 PROVKÖPING"), {
      line1: "Hus 9",
      line2: "c/o Exempel AB, Ekonomi",
      zip: "543 21",
      city: "Provköping",
    });
    assert.equal(parseRegisterAddress("C/O EXEMPEL AB \nBOX 12 \n543 21 PROVKÖPING").line2, "c/o EXEMPEL AB");
    assert.equal(parseRegisterAddress("C/O EXEMPEL AB \nBOX 12 \n543 21 PROVKÖPING").line1, "Box 12");
  });

  test("text som redan har gemener rörs inte, och bindestreck och snedstreck börjar nya ord", () => {
    assert.equal(parseRegisterAddress("Stora Vägen 1 \n111 22 Ort").line1, "Stora Vägen 1");
    assert.equal(parseRegisterAddress("NORRA-SÖDRA VÄGEN 1/A \n111 22 ORT").line1, "Norra-Södra Vägen 1/A");
  });

  test("en adress utan postnummer ger bara det som går att läsa", () => {
    assert.deepEqual(parseRegisterAddress("STORGATAN 12"), { line1: "Storgatan 12", line2: "", zip: "", city: "" });
    assert.deepEqual(parseRegisterAddress(""), { line1: "", line2: "", zip: "", city: "" });
  });
});

describe("svaret från momsregistret", () => {
  test("ett företag som finns ger namn och adress, med namnet som det står", () => {
    assert.deepEqual(companyFromVies({ isValid: true, userError: "VALID", name: "EXEMPEL  AKTIEBOLAG", address: "STORGATAN 12 \n123 45 EXEMPELSTAD" }), {
      name: "EXEMPEL AKTIEBOLAG",
      line1: "Storgatan 12",
      line2: "",
      zip: "123 45",
      city: "Exempelstad",
    });
  });

  test("ett nummer som inte finns ger ingenting", () => {
    assert.equal(companyFromVies({ isValid: false, userError: "INVALID", name: "---", address: "---" }), null);
    assert.equal(companyFromVies({ isValid: true, name: "---", address: "---" }), null);
    assert.equal(companyFromVies(null), null);
    assert.equal(companyFromVies("fel"), null);
  });

  test("ett företag utan adress ger bara namnet", () => {
    assert.deepEqual(companyFromVies({ isValid: true, name: "Exempel AB", address: "---" }), { name: "Exempel AB", line1: "", line2: "", zip: "", city: "" });
  });

  test("att registret inte kan svara skiljs från att numret inte finns", () => {
    assert.equal(viesUnavailable({ isValid: false, userError: "MS_UNAVAILABLE" }), true);
    assert.equal(viesUnavailable({ isValid: false, userError: "MS_MAX_CONCURRENT_REQ" }), true);
    assert.equal(viesUnavailable({ isValid: false, userError: "INVALID" }), false);
    assert.equal(viesUnavailable({ isValid: true, userError: "VALID" }), false);
    assert.equal(viesUnavailable(null), false);
  });
});

describe("ifyllningen", () => {
  const first = { name: "Exempel AB", line1: "Storgatan 12", line2: "", zip: "123 45", city: "Exempelstad" };
  const second = { name: "Annat AB", line1: "Lillgatan 3", line2: "c/o Någon", zip: "543 21", city: "Provköping" };
  const empty = { name: "", contactName: "", line1: "", line2: "", zip: "", city: "", phone: "" };

  test("ett tomt fält fylls i, och det kunden har skrivit står kvar", () => {
    assert.equal(filled("", "Exempel AB"), "Exempel AB");
    assert.equal(filled("  ", "Exempel AB"), "Exempel AB");
    assert.equal(filled("Mitt eget namn", "Exempel AB"), "Mitt eget namn");
    // Registret saknar uppgiften: fältet rörs inte.
    assert.equal(filled("Skrivet", ""), "Skrivet");
  });

  test("byts numret ersätts det registret fyllde i förra gången, men inte det som är skrivet för hand", () => {
    assert.equal(filled("Exempel AB", "Annat AB", "Exempel AB"), "Annat AB");
    assert.equal(filled("Exempel AB, avd. 2", "Annat AB", "Exempel AB"), "Exempel AB, avd. 2");
  });

  test("leveransadressen får företaget som mottagare och registrets adress", () => {
    const once = withCompanyAddress({ ...empty, contactName: "Anna Lind", phone: "070-123 45 67" }, first);
    assert.deepEqual(once, { name: "Exempel AB", contactName: "Anna Lind", line1: "Storgatan 12", line2: "", zip: "123 45", city: "Exempelstad", phone: "070-123 45 67" });
    // Kunden ändrar gatan för hand och skriver sedan ett annat nummer: gatan står kvar, resten byts.
    const edited = { ...once, line1: "Leveransgatan 9" };
    assert.deepEqual(withCompanyAddress(edited, second, first), {
      name: "Annat AB",
      contactName: "Anna Lind",
      line1: "Leveransgatan 9",
      line2: "c/o Någon",
      zip: "543 21",
      city: "Provköping",
      phone: "070-123 45 67",
    });
  });
});
