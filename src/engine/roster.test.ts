import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseBatchInput, rosterFromTable, rosterText } from "./index";

describe("rosterFromTable", () => {
  it("hittar namn och titel via rubrikraden, även med fler kolumner", () => {
    const roster = rosterFromTable([
      ["Anst.nr", "Namn", "E-post", "Befattning", "Avdelning"],
      ["101", "Åsa Öberg", "asa@foretag.se", "Säljchef", "Sälj"],
      ["102", "Erik Holm", "erik@foretag.se", "", "Lager"],
    ]);
    assert.deepEqual(roster.entries, [["Åsa Öberg", "Säljchef"], ["Erik Holm"]]);
    assert.deepEqual(roster.columns, { name: "Namn", title: "Befattning" });
  });

  it("slår ihop förnamn och efternamn", () => {
    const roster = rosterFromTable([
      ["Förnamn", "Efternamn", "Titel"],
      ["Wilma", "Berg", "Barista"],
    ]);
    assert.deepEqual(roster.entries, [["Wilma Berg", "Barista"]]);
    assert.equal(roster.columns?.name, "Förnamn + Efternamn");
  });

  it("hoppar över tomma rader och en titelrad ovanför rubrikerna", () => {
    const roster = rosterFromTable([["Personal Hotell Kronan 2026"], [], ["Name", "Title"], ["Ali Haddad", "Nattportier"]]);
    assert.deepEqual(roster.entries, [["Ali Haddad", "Nattportier"]]);
  });

  it("en överskrift som nämner namn tas inte för rubrikraden när tabellens rubriker står under", () => {
    const roster = rosterFromTable([["54 namn och titlar"], [], ["Namn", "Titel"], ["Ali Haddad", "Nattportier"], ["Sara Lind", "Concierge"]]);
    assert.deepEqual(roster.entries, [["Ali Haddad", "Nattportier"], ["Sara Lind", "Concierge"]]);
    assert.deepEqual(roster.columns, { name: "Namn", title: "Titel" });
    // Finns bara överskriften gäller den som förut.
    assert.deepEqual(rosterFromTable([["Namn på personalen"], ["Ali Haddad"]]).entries, [["Ali Haddad"]]);
  });

  it("en kolumn med rubriken Namn och titel delas vid kommatecknet", () => {
    const roster = rosterFromTable([["Namn och titel"], ["Ali Haddad, Nattportier"], ["Sara Lind, Chef, IT"], ["Maria Ek"]]);
    assert.deepEqual(roster.entries, [["Ali Haddad", "Nattportier"], ["Sara Lind", "Chef / IT"], ["Maria Ek"]]);
    assert.equal(rosterText(roster.entries), "Ali Haddad, Nattportier\nSara Lind, Chef / IT\nMaria Ek");
    // Med en egen titelkolumn delas ingenting: kommatecknet hör då till namnet.
    assert.deepEqual(rosterFromTable([["Namn", "Titel"], ["Holm, Erik", "Läkare"]]).entries, [["Holm / Erik", "Läkare"]]);
  });

  it("gissar kolumnerna utan rubrikrad — titeln först, namnet sist", () => {
    const roster = rosterFromTable([
      ["Receptionist", "Maria Ek", "maria@hotell.se"],
      ["Receptionist", "Johan Berg", "johan@hotell.se"],
      ["Concierge", "Sara Lind", "sara@hotell.se"],
    ]);
    assert.deepEqual(roster.entries[0], ["Maria Ek", "Receptionist"]);
    assert.equal(roster.columns, null);
  });

  it("gissar förnamn och efternamn i två kolumner utan rubrik", () => {
    const roster = rosterFromTable([
      ["Maria", "Ek", "Receptionschef"],
      ["Johan", "Berg", "Receptionist"],
    ]);
    assert.deepEqual(roster.entries, [["Maria Ek", "Receptionschef"], ["Johan Berg", "Receptionist"]]);
  });

  it("gör kommatecken i en cell till snedstreck så att raden inte delas fel", () => {
    const text = rosterText(rosterFromTable([["Namn", "Titel"], ["Erik Holm", "Chef, IT"]]).entries);
    assert.equal(text, "Erik Holm, Chef / IT");
    assert.deepEqual(parseBatchInput(text), [["Erik Holm", "Chef / IT"]]);
  });
});
