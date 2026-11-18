import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deflateRawSync } from "node:zlib";
import { parseDelimited, readTable, SpreadsheetError } from "./read-table";

/** Minimal zip-skrivare för testerna: lagrade eller deflate-komprimerade poster. */
function zip(files: Record<string, string>, deflate: boolean): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = Buffer.from(encoder.encode(name));
    const raw = Buffer.from(encoder.encode(content));
    const data = deflate ? deflateRawSync(raw) : raw;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, end]));
}

const WORKBOOK = {
  "xl/workbook.xml": `<workbook><sheets><sheet name="Personal" sheetId="1" r:id="rId7"/></sheets></workbook>`,
  "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId7" Target="worksheets/sheet3.xml"/></Relationships>`,
  "xl/sharedStrings.xml": `<sst><si><t>Namn</t></si><si><t>Befattning</t></si><si><r><t>Åsa </t></r><r><t>Öberg</t></r></si><si><t>Säljchef &amp; VD</t></si></sst>`,
  "xl/worksheets/sheet3.xml": `<worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>
    <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>42</v></c><c r="C2" t="s"><v>3</v></c></row>
    <row r="3"><c r="A3" t="inlineStr"><is><t>Erik Holm</t></is></c></row>
  </sheetData></worksheet>`,
};

describe("readTable — xlsx", () => {
  for (const deflate of [false, true]) {
    it(`läser första bladet med delade och inbäddade strängar (${deflate ? "deflate" : "lagrad"})`, async () => {
      const table = await readTable("personal.xlsx", zip(WORKBOOK, deflate));
      assert.deepEqual(table, [
        ["Namn", "", "Befattning"],
        ["Åsa Öberg", "42", "Säljchef & VD"],
        ["Erik Holm"],
      ]);
    });
  }

  it("hoppar över ett tomt första blad: en fil från ett skript har ofta namnen på nästa", async () => {
    const files = {
      "xl/workbook.xml": `<workbook><sheets><sheet name="Sheet" sheetId="1" r:id="rId1"/><sheet name="Namn och titlar" sheetId="2" r:id="rId2"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="/xl/worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>`,
      "xl/worksheets/sheet1.xml": `<worksheet><sheetData/></worksheet>`,
      "xl/worksheets/sheet2.xml": `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Namn</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Erik Holm</t></is></c></row></sheetData></worksheet>`,
    };
    assert.deepEqual(await readTable("lista.xlsx", zip(files, true)), [["Namn"], ["Erik Holm"]]);
    // Ett namngivet blad läses som det är, också när det är tomt.
    assert.deepEqual(await readTable("lista.xlsx", zip(files, true), { sheet: "Sheet" }), []);
    // Är alla blad tomma finns inget att läsa, men det är inget fel i filen.
    const empty = { ...files, "xl/worksheets/sheet2.xml": `<worksheet><sheetData/></worksheet>` };
    assert.deepEqual(await readTable("lista.xlsx", zip(empty, true)), []);
  });

  it("hittar de delade strängarna oavsett skiftläge i filnamnet", async () => {
    const { "xl/sharedStrings.xml": shared, ...rest } = WORKBOOK;
    const table = await readTable("personal.xlsx", zip({ ...rest, "xl/SharedStrings.xml": shared }, true));
    assert.deepEqual(table[1], ["Åsa Öberg", "42", "Säljchef & VD"]);
  });

  it("avvisar gamla .xls med ett begripligt fel", async () => {
    await assert.rejects(readTable("lista.xls", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])), SpreadsheetError);
  });

  it("säger ifrån om en .xlsx som inte är en zip-fil, och om en tom fil", async () => {
    // En lösenordsskyddad .xlsx är ingen zip-fil. Förut lästes den som text och gav "inga namn".
    await assert.rejects(readTable("lista.xlsx", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1])), /lösenordsskyddad/);
    await assert.rejects(readTable("lista.xlsx", new Uint8Array(0)), /tom/);
  });

  it("läser en fil där varje element har prefix, som AI-tjänsternas filverktyg skriver", async () => {
    // Verktyg byggda på Open XML SDK skriver <x:row> i stället för <row>, texten direkt i cellen
    // och en tom tabell för delade strängar. Förut blev en sådan fil helt tom: "Hittade inga namn".
    const files = {
      "xl/workbook.xml": `<?xml version="1.0" encoding="utf-8"?><x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheets><x:sheet name="Namn &amp; titlar" sheetId="1" r:id="R1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" /></x:sheets></x:workbook>`,
      "xl/sharedStrings.xml": `<?xml version="1.0" encoding="utf-8"?><x:sst xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" />`,
      "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="utf-8"?><x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:cols><x:col min="1" max="1" width="24" /></x:cols><x:sheetData><x:row r="1"><x:c r="A1" s="1" t="str"><x:v>Namn</x:v></x:c><x:c r="B1" s="1" t="str"><x:v>Titel</x:v></x:c></x:row><x:row r="2"><x:c r="A2" t="str"><x:v>Henrik Nyström</x:v></x:c><x:c r="B2" t="str"><x:v>Teknisk projektledare</x:v></x:c></x:row><x:row r="3"><x:c r="A3" t="inlineStr"><x:is><x:t>Sara Johansson</x:t></x:is></x:c><x:c r="B3" t="str"><x:f>"Account "&amp;"Manager"</x:f><x:v>Account Manager</x:v></x:c></x:row></x:sheetData></x:worksheet>`,
      "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml" Id="R1" /><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="/xl/sharedStrings.xml" Id="R2" /></Relationships>`,
    };
    const expected = [
      ["Namn", "Titel"],
      ["Henrik Nyström", "Teknisk projektledare"],
      ["Sara Johansson", "Account Manager"],
    ];
    assert.deepEqual(await readTable("54_namn_och_titlar.xlsx", zip(files, true)), expected);
    assert.deepEqual(await readTable("54_namn_och_titlar.xlsx", zip(files, true), { sheet: "Namn & titlar" }), expected);
  });

  it("håller ordningen på de delade strängarna när en av dem är tom", async () => {
    const files = {
      ...WORKBOOK,
      // Excel skriver en tom sträng som <si><t/></si>, andra program som <si/>.
      "xl/sharedStrings.xml": `<sst><si/><si><t>Namn</t></si><si><t/></si><si><t xml:space="preserve"> Åsa Öberg</t><rPh sb="0" eb="1"><t>uttal</t></rPh></si></sst>`,
      "xl/worksheets/sheet3.xml": `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>1</v></c><c r="B1" t="s"><v>0</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2" t="s"><v>3</v></c></row></sheetData></worksheet>`,
    };
    assert.deepEqual(await readTable("personal.xlsx", zip(files, true)), [["Namn", "", ""], [" Åsa Öberg"]]);
  });

  it("läser tomma rader, apostrofer kring attributen och värden med attribut", async () => {
    const files = {
      ...WORKBOOK,
      "xl/workbook.xml": `<workbook><sheets><sheet name='Personal' sheetId='1' r:id='rId7'/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id='rId7' Target='worksheets/sheet3.xml'/></Relationships>`,
      "xl/worksheets/sheet3.xml": `<worksheet><sheetData><row r='1' spans='1:2'/><row r='2'><c r='B2' t='str'><v xml:space="preserve">Erik Holm </v></c><c r='C2' s='4'/><c r='D2'><v>7</v></c></row></sheetData></worksheet>`,
    };
    assert.deepEqual(await readTable("personal.xlsx", zip(files, false)), [[], ["", "Erik Holm ", "", "7"]]);
  });

  it("läser bara bladets celler, inte ankaret till ett inbäddat objekt", async () => {
    const files = {
      ...WORKBOOK,
      "xl/worksheets/sheet3.xml": `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Erik Holm</t></is></c></row></sheetData><oleObjects><oleObject><objectPr><anchor><from><xdr:col>1</xdr:col><xdr:row>5</xdr:row></from></anchor></objectPr></oleObject></oleObjects></worksheet>`,
    };
    assert.deepEqual(await readTable("personal.xlsx", zip(files, true)), [["Erik Holm"]]);
  });

  it("hittar bladen också när sökvägarna i zip-filen har bakstreck", async () => {
    const files = Object.fromEntries(Object.entries(WORKBOOK).map(([name, content]) => [name.replace(/\//g, "\\"), content]));
    const table = await readTable("personal.xlsx", zip(files, true));
    assert.deepEqual(table[0], ["Namn", "", "Befattning"]);
  });
});

describe("parseDelimited", () => {
  it("känner igen semikolon från svensk Excel och citattecken", () => {
    assert.deepEqual(parseDelimited('Namn;Titel\r\n"Holm, Erik";"Läkare ""ST"""\r\n'), [
      ["Namn", "Titel"],
      ["Holm, Erik", 'Läkare "ST"'],
    ]);
  });

  it("läser tabbseparerat", () => {
    assert.deepEqual(parseDelimited("Wilma Berg\tBarista"), [["Wilma Berg", "Barista"]]);
  });
});

describe("readTable — csv", () => {
  it("faller tillbaka på Windows-1252 när filen inte är UTF-8", async () => {
    const latin1 = new Uint8Array([0xc5, 0x73, 0x61, 0x3b, 0x56, 0x44]);
    const table = await readTable("lista.csv", latin1);
    assert.deepEqual(table, [["Åsa", "VD"]]);
  });
});
