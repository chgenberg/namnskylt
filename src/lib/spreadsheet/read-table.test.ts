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

  it("avvisar gamla .xls med ett begripligt fel", async () => {
    await assert.rejects(readTable("lista.xls", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])), SpreadsheetError);
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
