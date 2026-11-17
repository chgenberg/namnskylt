/**
 * Läser en .xlsx eller en CSV/TSV till en tabell av strängar. Ur en .xlsx
 * läses första bladet som har något i sig: en fil gjord av ett skript har ofta
 * ett tomt förvalt blad först och innehållet på nästa.
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
  if (isZip(bytes)) return readXlsx(bytes, options.sheet, maxRows);
  if (extension === "xls") throw new SpreadsheetError("Gamla .xls-filer stöds inte — spara som .xlsx eller CSV.");
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
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
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

/* ───────────── XLSX ───────────── */

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

function textRuns(xml: string): string {
  return [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
    .map((m) => decodeXml(m[1] ?? ""))
    .join("");
}

function attribute(attrs: string, name: string): string | null {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1] ?? null;
}

function columnIndex(ref: string | null, fallback: number): number {
  const letters = ref?.match(/^[A-Z]+/)?.[0];
  if (!letters) return fallback;
  return [...letters].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
}

/** Bladens relations-id i arbetsbokens ordning: det namngivna bladet, eller alla när inget namn är givet. */
function sheetRelIds(workbook: string, sheetName: string | undefined): string[] {
  const sheets = [...workbook.matchAll(/<sheet\b([^>]*)\/?>/g)].map((m) => m[1] ?? "");
  const wanted = sheetName === undefined ? sheets : sheets.filter((attrs) => decodeXml(attribute(attrs, "name") ?? "") === sheetName);
  if (sheetName !== undefined && wanted.length === 0) throw new SpreadsheetError(`Hittade inget blad som heter ${sheetName}.`);
  return wanted.map((attrs) => attribute(attrs, "r:id")).filter((id): id is string => id !== null);
}

/** Sökvägarna till bladen som ska prövas, i arbetsbokens ordning. */
async function sheetPaths(
  bytes: Uint8Array,
  entries: Map<string, ZipEntry>,
  sheetName: string | undefined,
): Promise<string[]> {
  const workbook = await readEntry(bytes, entries, "xl/workbook.xml");
  const rels = await readEntry(bytes, entries, "xl/_rels/workbook.xml.rels");
  const targets = new Map<string, string>();
  for (const match of (rels ?? "").matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attrs = match[1] ?? "";
    const id = attribute(attrs, "Id");
    const target = attribute(attrs, "Target");
    if (id && target) targets.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`);
  }
  const paths = (workbook ? sheetRelIds(workbook, sheetName) : [])
    .map((id) => targets.get(id))
    .filter((path): path is string => path !== undefined && entries.has(path));
  if (paths.length > 0) return paths;
  const fallback = [...entries.keys()].filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort();
  if (fallback.length === 0) throw new SpreadsheetError("Hittade inget kalkylblad i filen.");
  return sheetName === undefined ? fallback : fallback.slice(0, 1);
}

/** De delade strängarna. Filen heter oftast `sharedStrings.xml`, men skiftläget skiljer mellan programmen som skriver den. */
async function sharedStrings(bytes: Uint8Array, entries: Map<string, ZipEntry>): Promise<string[]> {
  const name = [...entries.keys()].find((entry) => entry.toLowerCase() === "xl/sharedstrings.xml");
  const xml = name ? await readEntry(bytes, entries, name) : null;
  return xml ? [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textRuns(m[1] ?? "")) : [];
}

async function readXlsx(bytes: Uint8Array, sheetName: string | undefined, maxRows: number): Promise<Table> {
  const entries = zipDirectory(bytes);
  const shared = await sharedStrings(bytes, entries);
  let first: Table | null = null;
  for (const path of await sheetPaths(bytes, entries, sheetName)) {
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

function sheetRows(sheet: string, shared: readonly string[], maxRows: number): Table {
  const rows: Table = [];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    let position = 0;
    for (const cellMatch of (rowMatch[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1] ?? "";
      const body = cellMatch[2] ?? "";
      const index = columnIndex(attribute(attrs, "r"), position);
      const type = attribute(attrs, "t");
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      const value =
        type === "s"
          ? (shared[Number(raw)] ?? "")
          : type === "inlineStr"
            ? textRuns(body)
            : decodeXml(raw ?? "");
      while (row.length < index) row.push("");
      row[index] = value;
      position = index + 1;
    }
    rows.push(row);
    if (rows.length >= maxRows) break;
  }
  return rows;
}
