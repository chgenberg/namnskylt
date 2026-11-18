/**
 * Läser en .xlsx eller en CSV/TSV till en tabell av strängar. Ur en .xlsx
 * läses första bladet som har något i sig: en fil gjord av ett skript har ofta
 * ett tomt förvalt blad först och innehållet på nästa. Filen läses oavsett vilket
 * program som skrev den, se `xmlTags`.
 * Körs i webbläsaren — filen lämnar aldrig kundens dator.
 */

const MAX_SPREADSHEET_BYTES = 5 * 1024 * 1024;
const MAX_TABLE_ROWS = 2000;

export class SpreadsheetError extends Error {}

export type Table = string[][];

export interface ReadTableOptions {
  /** Bladets namn i en .xlsx; utan namn läses första bladet som inte är tomt. */
  sheet?: string;
  maxBytes?: number;
  maxRows?: number;
}

export async function readTable(fileName: string, bytes: Uint8Array, options: ReadTableOptions = {}): Promise<Table> {
  const maxBytes = options.maxBytes ?? MAX_SPREADSHEET_BYTES;
  const maxRows = options.maxRows ?? MAX_TABLE_ROWS;
  if (bytes.byteLength > maxBytes) {
    throw new SpreadsheetError(`Filen är för stor — max ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  }
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  if (bytes.byteLength === 0) throw new SpreadsheetError("Filen är tom.");
  if (isZip(bytes)) return readXlsx(bytes, options.sheet, maxRows);
  if (extension === "xls") throw new SpreadsheetError("Gamla .xls-filer stöds inte — spara som .xlsx eller CSV.");
  // En .xlsx är alltid en zip-fil. Annars är den lösenordsskyddad, eller något annat som har fått ändelsen.
  if (extension === "xlsx" || extension === "xlsm") {
    throw new SpreadsheetError("Filen går inte att läsa som .xlsx. Är den lösenordsskyddad? Spara den utan lösenord som .xlsx eller CSV.");
  }
  if (["numbers", "ods"].includes(extension)) {
    throw new SpreadsheetError("Exportera filen som .xlsx eller CSV först.");
  }
  return parseDelimited(decodeText(bytes), maxRows);
}

/* ───────────── CSV / TSV ───────────── */

function decodeText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  // Excel på svenska Windows sparar CSV som Windows-1252.
  return utf8.includes("\uFFFD") ? new TextDecoder("windows-1252").decode(bytes) : utf8.replace(/^\uFEFF/, "");
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const best = ["\t", ";", ","]
    .map((d) => ({ d, n: firstLine.split(d).length - 1 }))
    .reduce((a, b) => (b.n > a.n ? b : a));
  return best.n > 0 ? best.d : ",";
}

export function parseDelimited(text: string, maxRows: number = MAX_TABLE_ROWS): Table {
  const delimiter = detectDelimiter(text);
  const rows: Table = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      if (rows.length >= maxRows) return rows;
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) rows.push([...row, cell]);
  return rows;
}

/* ───────────── Zip ───────────── */

function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

interface ZipEntry {
  method: number;
  compressedSize: number;
  localOffset: number;
}

function zipDirectory(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new SpreadsheetError("Filen gick inte att läsa — är den en riktig .xlsx?");

  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const entries = new Map<string, ZipEntry>();
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    // Äldre Windows-program skriver sökvägarna med bakstreck.
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)).replace(/\\/g, "/");
    entries.set(name, {
      method: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      localOffset: view.getUint32(offset + 42, true),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readEntry(bytes: Uint8Array, entries: Map<string, ZipEntry>, name: string): Promise<string | null> {
  const entry = entries.get(name);
  if (!entry) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const local = entry.localOffset;
  const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
  const data = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method === 8) return new TextDecoder().decode(await inflateRaw(data));
  throw new SpreadsheetError("Filen använder en komprimering vi inte kan läsa — spara om som .xlsx.");
}

/* ───────────── XML ───────────── */

function decodeXml(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

interface XmlTag {
  /** Elementets namn utan prefix: `<x:row>` och `<row>` är samma element. */
  name: string;
  attrs: string;
  kind: "open" | "close" | "empty";
  /** Var taggen börjar och slutar i texten. */
  start: number;
  end: number;
}

/** En tagg med sina attribut. Värdena står inom citattecken eller apostrofer och får innehålla `>`. */
const TAG = /<(\/?)(?:[\w.-]+:)?([\w.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/;

/**
 * Taggarna i en XML-text, i ordning. Programmen skriver samma fil på olika
 * sätt: Excel utan prefix (`<row>`), filverktyg byggda på Open XML SDK, som
 * AI-tjänsternas, med prefix på varje element (`<x:row>`). Namnet ges därför
 * utan prefix, och en tom tagg (`<si/>`) skiljs från en som öppnar.
 */
function* xmlTags(xml: string): Generator<XmlTag> {
  const pattern = new RegExp(TAG.source, "g");
  for (let match = pattern.exec(xml); match; match = pattern.exec(xml)) {
    yield {
      name: match[2] ?? "",
      attrs: match[3] ?? "",
      kind: match[1] ? "close" : match[4] ? "empty" : "open",
      start: match.index,
      end: pattern.lastIndex,
    };
  }
}

/** Attributets värde, sökt på namnet utan prefix: `id` hittar `r:id` men inte `sheetId`. */
function attribute(attrs: string, name: string): string | null {
  const match = new RegExp(`(?:^|\\s)(?:[\\w.-]+:)?${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(attrs);
  return match ? decodeXml(match[1] ?? match[2] ?? "") : null;
}

/** Samlar texten i `<t>`-elementen, utan uttalsangivelserna i `<rPh>`. */
function textReader(xml: string) {
  let text = "";
  let from = -1;
  let phonetic = 0;
  return {
    feed(tag: XmlTag): void {
      if (tag.name === "rPh") phonetic += tag.kind === "open" ? 1 : tag.kind === "close" ? -1 : 0;
      else if (tag.name === "t" && phonetic === 0) {
        if (tag.kind === "open") from = tag.end;
        else if (tag.kind === "close" && from >= 0) {
          text += decodeXml(xml.slice(from, tag.start));
          from = -1;
        }
      }
    },
    take(): string {
      const taken = text;
      text = "";
      from = -1;
      phonetic = 0;
      return taken;
    },
  };
}

/* ───────────── XLSX ───────────── */

function columnIndex(ref: string | null, fallback: number): number {
  const letters = ref?.match(/^[A-Z]+/)?.[0];
  if (!letters) return fallback;
  return [...letters].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
}

interface Relationship {
  id: string;
  type: string;
  /** Sökvägen i zip-filen. */
  path: string;
}

/** Arbetsbokens relationer: vilka filer i zip-filen som är blad och delade strängar. */
function relationships(rels: string | null): Relationship[] {
  const found: Relationship[] = [];
  for (const tag of xmlTags(rels ?? "")) {
    if (tag.name !== "Relationship" || tag.kind === "close") continue;
    const id = attribute(tag.attrs, "Id");
    const target = attribute(tag.attrs, "Target");
    if (!id || !target) continue;
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    found.push({ id, type: attribute(tag.attrs, "Type") ?? "", path });
  }
  return found;
}

/** Bladens relations-id i arbetsbokens ordning: det namngivna bladet, eller alla när inget namn är givet. */
function sheetRelIds(workbook: string, sheetName: string | undefined): string[] {
  const sheets = [...xmlTags(workbook)].filter((tag) => tag.name === "sheet" && tag.kind !== "close").map((tag) => tag.attrs);
  const wanted = sheetName === undefined ? sheets : sheets.filter((attrs) => attribute(attrs, "name") === sheetName);
  if (sheetName !== undefined && wanted.length === 0) throw new SpreadsheetError(`Hittade inget blad som heter ${sheetName}.`);
  return wanted.map((attrs) => attribute(attrs, "id")).filter((id): id is string => id !== null);
}

/** Sökvägarna till bladen som ska prövas, i arbetsbokens ordning. */
async function sheetPaths(
  bytes: Uint8Array,
  entries: Map<string, ZipEntry>,
  rels: readonly Relationship[],
  sheetName: string | undefined,
): Promise<string[]> {
  const workbook = await readEntry(bytes, entries, "xl/workbook.xml");
  const targets = new Map(rels.map((rel) => [rel.id, rel.path]));
  const paths = (workbook ? sheetRelIds(workbook, sheetName) : [])
    .map((id) => targets.get(id))
    .filter((path): path is string => path !== undefined && entries.has(path));
  if (paths.length > 0) return paths;
  const fallback = [...entries.keys()].filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort();
  if (fallback.length === 0) throw new SpreadsheetError("Hittade inget kalkylblad i filen.");
  return sheetName === undefined ? fallback : fallback.slice(0, 1);
}

/**
 * De delade strängarna. Arbetsbokens relationer pekar ut filen; saknas den där heter den oftast
 * `sharedStrings.xml`, men skiftläget skiljer mellan programmen som skriver den.
 */
async function sharedStrings(bytes: Uint8Array, entries: Map<string, ZipEntry>, rels: readonly Relationship[]): Promise<string[]> {
  const related = rels.find((rel) => rel.type.endsWith("/sharedStrings") && entries.has(rel.path))?.path;
  const name = related ?? [...entries.keys()].find((entry) => entry.toLowerCase() === "xl/sharedstrings.xml");
  const xml = name ? await readEntry(bytes, entries, name) : null;
  if (!xml) return [];
  const strings: string[] = [];
  const text = textReader(xml);
  let inside = false;
  for (const tag of xmlTags(xml)) {
    if (tag.name !== "si") {
      if (inside) text.feed(tag);
    } else if (tag.kind === "open") {
      inside = true;
    } else {
      // En tom sträng (`<si/>`) har också ett nummer, annars förskjuts alla efter den.
      strings.push(text.take());
      inside = false;
    }
  }
  return strings;
}

async function readXlsx(bytes: Uint8Array, sheetName: string | undefined, maxRows: number): Promise<Table> {
  const entries = zipDirectory(bytes);
  const rels = relationships(await readEntry(bytes, entries, "xl/_rels/workbook.xml.rels"));
  const shared = await sharedStrings(bytes, entries, rels);
  let first: Table | null = null;
  for (const path of await sheetPaths(bytes, entries, rels, sheetName)) {
    const sheet = await readEntry(bytes, entries, path);
    if (sheet === null) continue;
    const rows = sheetRows(sheet, shared, maxRows);
    // Första bladet som har något i sig. Är alla tomma gäller det första, som förut.
    if (rows.some((row) => row.some((cell) => cell.trim() !== ""))) return rows;
    first ??= rows;
  }
  if (first === null) throw new SpreadsheetError("Hittade inget kalkylblad i filen.");
  return first;
}

interface OpenCell {
  index: number;
  type: string | null;
  /** Innehållet i `<v>`: värdet, eller numret på en delad sträng. */
  value: string | null;
}

/**
 * Bladets rader. Bara `<sheetData>` läses: ett blad med ett inbäddat objekt har
 * dessutom ankare med element som också heter `row`.
 */
function sheetRows(sheet: string, shared: readonly string[], maxRows: number): Table {
  const rows: Table = [];
  const text = textReader(sheet);
  let inData = false;
  let row: string[] | null = null;
  let cell: OpenCell | null = null;
  let position = 0;
  let valueFrom = -1;

  const closeCell = (target: string[], open: OpenCell) => {
    const inline = text.take();
    const value =
      open.type === "inlineStr" || open.value === null
        ? inline
        : open.type === "s"
          ? (shared[Number(open.value)] ?? "")
          : decodeXml(open.value);
    while (target.length < open.index) target.push("");
    target[open.index] = value;
    position = open.index + 1;
  };

  for (const tag of xmlTags(sheet)) {
    if (tag.name === "sheetData") {
      if (tag.kind !== "open") break;
      inData = true;
    } else if (!inData) {
      continue;
    } else if (tag.name === "row") {
      if (tag.kind !== "close") {
        row = [];
        position = 0;
      }
      if (tag.kind !== "open" && row) {
        rows.push(row);
        row = null;
        if (rows.length >= maxRows) break;
      }
    } else if (!row) {
      continue;
    } else if (tag.name === "c") {
      if (tag.kind !== "close") {
        cell = { index: columnIndex(attribute(tag.attrs, "r"), position), type: attribute(tag.attrs, "t"), value: null };
        text.take();
      }
      if (tag.kind !== "open" && cell) {
        closeCell(row, cell);
        cell = null;
      }
    } else if (!cell) {
      continue;
    } else if (tag.name === "v") {
      if (tag.kind === "open") valueFrom = tag.end;
      else if (tag.kind === "close" && valueFrom >= 0) {
        cell.value = sheet.slice(valueFrom, tag.start);
        valueFrom = -1;
      }
    } else {
      text.feed(tag);
    }
  }
  return rows;
}
