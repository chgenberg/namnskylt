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
