import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  accountPaths,
  customerCookieName,
  customerPasswordSchema,
  EMPTY_PROFILE,
  MIN_CUSTOMER_PASSWORD_CHARS,
  normalizeEmail,
  parseProfile,
  profileAfterOrder,
  profileFromDraft,
  profileInputSchema,
  SESSION_TOKEN_PATTERN,
} from "./model";

const ADDRESS = {
  name: "Exempel AB",
  contactName: "Anna Lind",
  line1: "Storgatan 1",
  line2: null,
  zip: "111 22",
  city: "Stockholm",
  country: "SE" as const,
  phone: "070-123 45 67",
};

describe("kundkontots plats", () => {
  test("namnskylt.com och varje butik har sin egen kaka", () => {
    assert.equal(customerCookieName(null), "ns_kund");
    assert.equal(customerCookieName("exempel-profil"), "ns_kund_exempel-profil");
    assert.notEqual(customerCookieName("a"), customerCookieName("b"));
  });

  test("sidorna ligger på namnskylt.com eller i butiken", () => {
    assert.deepEqual(
      { home: accountPaths(null).home, login: accountPaths(null).login, designer: accountPaths(null).designer },
      { home: "/konto", login: "/konto/logga-in", designer: "/skapa" },
    );
    const shop = accountPaths("exempel-profil");
    assert.equal(shop.home, "/butik/exempel-profil/konto");
    assert.equal(shop.login, "/butik/exempel-profil/konto/logga-in");
    assert.equal(shop.password("abc"), "/butik/exempel-profil/konto/losenord/abc");
    assert.equal(shop.forgot, "/butik/exempel-profil/konto/glomt");
    assert.equal(shop.reorder("NS-1052"), "/butik/exempel-profil/skapa?igen=NS-1052");
    // Från varukorgen och tillbaka dit, med samma märke i båda adresserna.
    assert.equal(accountPaths(null).forgotFromCart, "/konto/glomt?varukorg=1");
    assert.equal(accountPaths(null).cart, "/skapa?varukorg=1");
    assert.equal(shop.cart, "/butik/exempel-profil/skapa?varukorg=1");
  });

  test("e-postadressen sparas utan mellanslag och med gemener", () => {
    assert.equal(normalizeEmail("  Anna.Lind@Exempel.SE "), "anna.lind@exempel.se");
  });
});

describe("kundkontots lösenord och koder", () => {
  test("lösenordet har en minsta längd", () => {
    assert.equal(customerPasswordSchema.safeParse("a".repeat(MIN_CUSTOMER_PASSWORD_CHARS - 1)).success, false);
    assert.equal(customerPasswordSchema.safeParse("a".repeat(MIN_CUSTOMER_PASSWORD_CHARS)).success, true);
    assert.equal(customerPasswordSchema.safeParse("a".repeat(201)).success, false);
  });

  test("en kod är 32 byte i base64url och inget annat", () => {
    assert.equal(SESSION_TOKEN_PATTERN.test("A".repeat(43)), true);
    assert.equal(SESSION_TOKEN_PATTERN.test("A".repeat(42)), false);
    assert.equal(SESSION_TOKEN_PATTERN.test(`${"A".repeat(42)}/`), false);
  });
});

describe("kundkontots uppgifter", () => {
  test("en sparad profil läses, och det som saknas eller är trasigt blir tomt", () => {
    assert.deepEqual(parseProfile(null), EMPTY_PROFILE);
    assert.deepEqual(parseProfile({}), EMPTY_PROFILE);
    assert.deepEqual(parseProfile({ name: "Anna Lind", company: 12, delivery: { name: "x" } }), { ...EMPTY_PROFILE, name: "Anna Lind" });
    assert.deepEqual(parseProfile({ name: "Anna Lind", company: "Exempel AB", orgNumber: "556123-4567", delivery: ADDRESS }), {
      name: "Anna Lind",
      company: "Exempel AB",
      orgNumber: "556123-4567",
      delivery: ADDRESS,
    });
  });

  test("efter en order gäller det kunden just fyllde i", () => {
    const before = { name: "Anna Lind", company: "Gamla AB", orgNumber: "556123-4567", delivery: ADDRESS };
    const next = { ...ADDRESS, line1: "Nygatan 2" };
    assert.deepEqual(profileAfterOrder(before, { name: "Anna Berg", company: "Nya AB", orgNumber: "556765-4321" }, next), {
      name: "Anna Berg",
      company: "Nya AB",
      orgNumber: "556765-4321",
      delivery: next,
    });
  });

  test("det som inte fylldes i står kvar", () => {
    const before = { name: "Anna Lind", company: "Exempel AB", orgNumber: "556123-4567", delivery: ADDRESS };
    assert.deepEqual(profileAfterOrder(before, { name: " ", company: null }, null), before);
  });

  test("organisationsnumret får vara tomt men inte fel, och sparas med bindestreck", () => {
    const base = { name: "Anna Lind", company: "Exempel AB", delivery: null };
    assert.equal(profileInputSchema.safeParse({ ...base, orgNumber: "" }).success, true);
    assert.equal(profileInputSchema.safeParse({ ...base, orgNumber: "12345" }).success, false);
    const parsed = profileInputSchema.safeParse({ ...base, orgNumber: "5561234567" });
    assert.equal(parsed.success && parsed.data.orgNumber, "556123-4567");
  });

  test("en leveransadress som fylls i ska vara hel", () => {
    const base = { name: "", company: "", orgNumber: "" };
    assert.equal(profileInputSchema.safeParse({ ...base, delivery: ADDRESS }).success, true);
    assert.equal(profileInputSchema.safeParse({ ...base, delivery: { ...ADDRESS, zip: "12" } }).success, false);
  });
});

describe("uppgifterna i ett formulär", () => {
  const EMPTY_ADDRESS = { name: "", contactName: "", line1: "", line2: "", zip: "", city: "", phone: "" };

  test("allt får lämnas tomt", () => {
    assert.deepEqual(profileFromDraft({ name: "", company: "", orgNumber: "", delivery: EMPTY_ADDRESS }), { ok: true, profile: EMPTY_PROFILE });
    assert.deepEqual(profileFromDraft(undefined), { ok: true, profile: EMPTY_PROFILE });
    assert.deepEqual(profileFromDraft({ name: 12, delivery: "x" }), { ok: true, profile: EMPTY_PROFILE });
  });

  test("ifyllda uppgifter sparas, med organisationsnumret och postnumret som de ska skrivas", () => {
    const result = profileFromDraft({
      name: " Anna Lind ",
      company: "Exempel AB",
      orgNumber: " 5561234567 ",
      delivery: { ...EMPTY_ADDRESS, name: "Exempel AB", line1: "Storgatan 1", zip: "11122", city: "Stockholm", phone: "070-123 45 67" },
    });
    assert.ok(result.ok);
    assert.deepEqual(result.profile, {
      name: "Anna Lind",
      company: "Exempel AB",
      orgNumber: "556123-4567",
      delivery: { name: "Exempel AB", contactName: null, line1: "Storgatan 1", line2: null, zip: "111 22", city: "Stockholm", country: "SE", phone: "070-123 45 67" },
    });
  });

  test("en påbörjad leveransadress ska vara hel, och ett ifyllt organisationsnummer rätt", () => {
    const half = profileFromDraft({ name: "", company: "", orgNumber: "", delivery: { ...EMPTY_ADDRESS, line1: "Storgatan 1" } });
    assert.equal(half.ok, false);
    const wrong = profileFromDraft({ name: "", company: "", orgNumber: "123", delivery: EMPTY_ADDRESS });
    assert.deepEqual(wrong, { ok: false, error: "Organisationsnumret ska ha tio siffror" });
  });
});
