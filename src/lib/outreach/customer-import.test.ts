import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  CustomerSheetError,
  excelSerialToIsoDate,
  firstName,
  parseCustomerSheet,
  summarizeImport,
  websiteFor,
} from "./customer-import";

const HEADER = [
  "Företag",
  "Telefonnummer",
  "Ort",
  "Land",
  "Kontaktperson",
  "Kontakt-mail",
  "Hemsida",
  "Blev kund",
  "Aktiverat sortiment",
  "Känd/inte känd",
  "Kontaktad",
  "Kommentar",
];

function row(over: Partial<Record<(typeof HEADER)[number], string>>): string[] {
  const base: Record<string, string> = {
    Företag: "Profil AB",
    Telefonnummer: "08-123 45",
    Ort: "Stockholm",
    Land: "Sverige",
    Kontaktperson: "Anna Berg",
    "Kontakt-mail": "anna@profilab.se",
    Hemsida: "https://profilab.se",
    "Blev kund": "43563.0",
    "Aktiverat sortiment": "Har ej aktiverat er",
    "Känd/inte känd": "",
    Kontaktad: "0",
    Kommentar: "",
  };
  return HEADER.map((h) => over[h] ?? base[h] ?? "");
}

describe("kundbladet", () => {
  test("en vanlig rad blir ett lead", () => {
    const { leads } = parseCustomerSheet([HEADER, row({})]);
    const [lead] = leads;
    assert.ok(lead);
    assert.equal(lead.email, "anna@profilab.se");
    assert.equal(lead.contactName, "Anna Berg");
    assert.equal(lead.country, "se");
    assert.equal(lead.customerSince, "2019-04-08");
    assert.equal(lead.activated, false);
    assert.equal(lead.known, false);
    assert.equal(lead.website, "https://profilab.se");
    assert.equal(lead.wave, "C");
    assert.deepEqual(lead.checkReasons, []);
  });

  test("&nbsp; framför aktiveringen trimmas och JA/Ja räknas som känd", () => {
    const { leads } = parseCustomerSheet([
      HEADER,
      row({ "Aktiverat sortiment": "&nbsp;Har aktiverat er", "Känd/inte känd": "JA" }),
      row({ "Kontakt-mail": "b@annan.se", "Känd/inte känd": "Ja" }),
    ]);
    assert.equal(leads[0]?.activated, true);
    assert.equal(leads[0]?.known, true);
    assert.equal(leads[0]?.wave, "A");
    assert.equal(leads[1]?.known, true);
  });

  test("en e-postadress som kontaktperson graveras inte som namn", () => {
    const { leads } = parseCustomerSheet([HEADER, row({ Kontaktperson: "order@profilab.se" })]);
    assert.equal(leads[0]?.contactName, null);
    assert.ok(leads[0]?.checkReasons.includes("contact-is-email"));
  });

  test("Land ax blir Åland och norska rader får vågen NO", () => {
    const { leads } = parseCustomerSheet([
      HEADER,
      row({ Land: "ax", "Kontakt-mail": "a@firma.ax" }),
      row({ Land: "Norge", "Kontakt-mail": "b@firma.no" }),
    ]);
    assert.equal(leads[0]?.country, "ax");
    assert.equal(leads[0]?.wave, "NO");
    assert.equal(leads[1]?.country, "no");
  });

  test("dubbletter på e-post slås ihop oavsett skiftläge", () => {
    const sheet = parseCustomerSheet([HEADER, row({}), row({ "Kontakt-mail": "ANNA@profilab.se " })]);
    assert.equal(sheet.leads.length, 1);
    assert.equal(sheet.duplicates, 1);
  });

  test("två kontakter på samma domän flaggas för granskning", () => {
    const { leads } = parseCustomerSheet([HEADER, row({}), row({ "Kontakt-mail": "per@profilab.se" })]);
    assert.equal(leads.length, 2);
    assert.ok(leads.every((l) => l.checkReasons.includes("shared-domain")));
  });

  test("fripost tillåts men får ingen webbplats och flaggas", () => {
    const { leads } = parseCustomerSheet([HEADER, row({ "Kontakt-mail": "anna.berg@gmail.com" })]);
    assert.equal(leads[0]?.website, null);
    assert.ok(leads[0]?.checkReasons.includes("free-mail"));
  });

  test("två adresser i en cell ger den första och en flagga", () => {
    const { leads } = parseCustomerSheet([HEADER, row({ "Kontakt-mail": "anna@profilab.se;info@profilab.se" })]);
    assert.equal(leads[0]?.email, "anna@profilab.se");
    assert.ok(leads[0]?.checkReasons.includes("multiple-emails"));
  });

  test("rader utan e-post räknas men blir inga leads", () => {
    const sheet = parseCustomerSheet([HEADER, row({ "Kontakt-mail": "" })]);
    assert.equal(sheet.leads.length, 0);
    assert.equal(sheet.missingEmail, 1);
  });

  test("ett blad utan e-postkolumn vägras", () => {
    assert.throws(() => parseCustomerSheet([["Företag", "Land"], ["X", "Sverige"]]), CustomerSheetError);
  });

  test("sammanfattningen innehåller inga namn eller adresser", () => {
    const sheet = parseCustomerSheet([HEADER, row({}), row({ "Kontakt-mail": "b@x.se", Kontaktperson: "Bo Ek" })]);
    const text = JSON.stringify(summarizeImport([sheet]));
    assert.equal(text.includes("@"), false);
    assert.equal(text.includes("Anna"), false);
    assert.match(text, /"leads":2/);
  });
});

describe("webbplatsen", () => {
  test("en United Profile-hemsida ger mejldomänen i stället", () => {
    const result = websiteFor("anna@profilab.se", "https://w2820-c3116.unitedprofile.se/");
    assert.equal(result.website, "https://profilab.se");
    assert.equal(result.upShopUrl, "https://w2820-c3116.unitedprofile.se/");
  });

  test("en hemsida på samma domän används som den är", () => {
    assert.equal(websiteFor("a@firma.se", "https://ort.firma.se").website, "https://ort.firma.se");
  });

  test("fripost ger ingen webbplats", () => {
    assert.equal(websiteFor("a@hotmail.com", "").website, null);
  });
});

describe("hjälpare", () => {
  test("Excel-datum", () => {
    assert.equal(excelSerialToIsoDate("45658"), "2025-01-01");
    assert.equal(excelSerialToIsoDate(""), null);
    assert.equal(excelSerialToIsoDate("inte ett datum"), null);
  });

  test("förnamn", () => {
    assert.equal(firstName("Anna Berg"), "Anna");
    assert.equal(firstName(null), null);
    assert.equal(firstName("A"), null);
  });
});
