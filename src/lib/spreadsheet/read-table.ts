/**
 * Läser första bladet i en .xlsx eller en CSV/TSV till en tabell av strängar.
 * Körs i webbläsaren — filen lämnar aldrig kundens dator.
 */

export const MAX_SPREADSHEET_BYTES = 5 * 1024 * 1024;
const MAX_TABLE_ROWS = 2000;

export class SpreadsheetError extends Error {}

export type Table = string[][];

export async function readTable(fileName: string, bytes: Uint8Array): Promise<Table> {
  if (bytes.byteLength > MAX_SPREADSHEET_BYTES) throw new SpreadsheetError("Filen är för stor — max 5 MB.");
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  if (isZip(bytes)) return readXlsx(bytes);
  if (extension === "xls") throw new SpreadsheetError("Gamla .xls-filer stöds inte — spara som .xlsx eller CSV.");
  if (["numbers", "ods"].includes(extension)) {
    throw new SpreadsheetError("Exportera filen som .xlsx eller CSV först.");
  }
  return parseDelimited(decodeText(bytes));
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

export function parseDelimited(text: string): Table {
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
      if (rows.length >= MAX_TABLE_ROWS) return rows;
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

async function firstSheetPath(bytes: Uint8Array, entries: Map<string, ZipEntry>): Promise<string> {
  const workbook = await readEntry(bytes, entries, "xl/workbook.xml");
  const rels = await readEntry(bytes, entries, "xl/_rels/workbook.xml.rels");
  const relId = workbook && attribute(/<sheet\b([^>]*)\/?>/.exec(workbook)?.[1] ?? "", "r:id");
  if (rels && relId) {
    for (const match of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
      const attrs = match[1] ?? "";
      const target = attribute(attrs, "Target");
      if (attribute(attrs, "Id") === relId && target) {
        return target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
      }
    }
  }
  const fallback = [...entries.keys()].filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
  if (!fallback) throw new SpreadsheetError("Hittade inget kalkylblad i filen.");
  return fallback;
}

async function readXlsx(bytes: Uint8Array): Promise<Table> {
  const entries = zipDirectory(bytes);
  const sharedXml = await readEntry(bytes, entries, "xl/sharedStrings.xml");
  const shared = sharedXml ? [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textRuns(m[1] ?? "")) : [];
  const sheet = await readEntry(bytes, entries, await firstSheetPath(bytes, entries));
  if (!sheet) throw new SpreadsheetError("Hittade inget kalkylblad i filen.");

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
    if (rows.length >= MAX_TABLE_ROWS) break;
  }
  return rows;
}
