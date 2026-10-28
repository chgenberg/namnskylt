/**
 * Personallista från ett kalkylark: hittar vilka kolumner som är namn och
 * titel — med eller utan rubrikrad — och ger en skylt per person.
 */

type ColumnKind = "name" | "first" | "last" | "title" | "skip";

export interface RosterColumns {
  /** Rubrikerna som användes, för att kunna berätta det för kunden. */
  name: string;
  title: string | null;
}

export interface Roster {
  entries: string[][];
  columns: RosterColumns | null;
}

const HEADER_SCAN_ROWS = 5;

const HEADER_WORDS: Record<ColumnKind, readonly string[]> = {
  first: ["förnamn", "first name", "firstname", "given name", "fornamn"],
  last: ["efternamn", "last name", "lastname", "surname", "family name"],
  title: ["titel", "title", "befattning", "roll", "role", "tjänst", "yrke", "position", "job title", "jobbtitel", "yrkestitel", "tjänstetitel"],
  name: ["namn", "name", "medarbetare", "anställd", "person", "kollega", "full name", "fullständigt namn"],
  skip: ["e-post", "epost", "email", "e-mail", "mejl", "mail", "telefon", "mobil", "phone", "tel", "personnummer", "anställningsnummer"],
};

const CLASSIFY_ORDER: readonly ColumnKind[] = ["first", "last", "skip", "title", "name"];

function normalizeHeader(cell: string): string {
  return cell.toLowerCase().replace(/[^\p{L}\s-]/gu, " ").replace(/\s+/g, " ").trim();
}

function classifyHeader(cell: string): ColumnKind | null {
  const header = ` ${normalizeHeader(cell)} `;
  if (!header.trim()) return null;
  for (const kind of CLASSIFY_ORDER) {
    if (HEADER_WORDS[kind].some((word) => header.includes(` ${word} `))) return kind;
  }
  return null;
}

const PERSON_NAME = /^\p{Lu}[\p{L}'’.-]*(?:\s+(?:af|av|von|van|de|la|du|\p{Lu}[\p{L}'’.-]*)){1,3}$/u;
const SINGLE_WORD_NAME = /^\p{Lu}[\p{L}'’-]+$/u;
const CONTACT = /@|^[+\d\s()-]{6,}$/;

function clean(cell: string | undefined): string {
  return (cell ?? "").replace(/\s+/g, " ").trim();
}

/** Kommatecken delar rader i textrutan — inne i en cell blir de snedstreck. */
function cellText(cell: string | undefined): string {
  return clean(cell).replace(/\s*,\s*/g, " / ");
}

function columnValues(rows: readonly (readonly string[])[], column: number): string[] {
  return rows.map((row) => clean(row[column])).filter((value) => value.length > 0);
}

function share(values: readonly string[], test: (value: string) => boolean): number {
  return values.length === 0 ? 0 : values.filter(test).length / values.length;
}

function findHeader(table: readonly (readonly string[])[]): { index: number; kinds: (ColumnKind | null)[] } | null {
  for (let index = 0; index < Math.min(HEADER_SCAN_ROWS, table.length); index++) {
    const kinds = (table[index] ?? []).map(classifyHeader);
    if (kinds.some((kind) => kind === "name" || kind === "first" || kind === "last")) return { index, kinds };
  }
  return null;
}

function fromHeader(table: readonly (readonly string[])[], header: { index: number; kinds: (ColumnKind | null)[] }): Roster {
  const headings = table[header.index] ?? [];
  const first = header.kinds.indexOf("first");
  const last = header.kinds.indexOf("last");
  const name = header.kinds.indexOf("name");
  const title = header.kinds.indexOf("title");

  const nameOf = (row: readonly string[]): string =>
    first >= 0 || last >= 0
      ? [first >= 0 ? cellText(row[first]) : "", last >= 0 ? cellText(row[last]) : ""].filter(Boolean).join(" ")
      : cellText(row[name]);

  const entries = table
    .slice(header.index + 1)
    .map((row) => [nameOf(row), title >= 0 ? cellText(row[title]) : ""].filter(Boolean))
    .filter((entry) => entry.length > 0);

  const nameHeading =
    first >= 0 || last >= 0
      ? [first, last].filter((i) => i >= 0).map((i) => clean(headings[i])).join(" + ")
      : clean(headings[name]);
  return { entries, columns: { name: nameHeading, title: title >= 0 ? clean(headings[title]) : null } };
}

/** Utan rubrikrad: kolumnen som ser mest ut som för- och efternamn blir namnet, nästa textkolumn titeln. */
function guessColumns(table: readonly (readonly string[])[]): Roster {
  const width = Math.max(0, ...table.map((row) => row.length));
  const stats = Array.from({ length: width }, (_, column) => {
    const values = columnValues(table, column);
    return {
      column,
      values,
      person: share(values, (v) => PERSON_NAME.test(v)),
      single: share(values, (v) => SINGLE_WORD_NAME.test(v)),
      contact: share(values, (v) => CONTACT.test(v)),
    };
  }).filter((s) => s.values.length > 0 && s.contact < 0.5);

  if (stats.length === 0) return { entries: [], columns: null };

  const byPerson = [...stats].sort((a, b) => b.person - a.person || a.column - b.column);
  let nameColumns = [byPerson[0]?.column ?? 0];
  const best = byPerson[0];
  // Förnamn och efternamn i två kolumner bredvid varandra, utan rubrik.
  if (best && best.person < 0.5) {
    const pair = stats.find((s, i) => {
      const next = stats[i + 1];
      return next && next.column === s.column + 1 && s.single > 0.8 && next.single > 0.8;
    });
    if (pair) nameColumns = [pair.column, pair.column + 1];
  }

  const titleStat = stats.find((s) => !nameColumns.includes(s.column));
  const entries = table
    .map((row) =>
      [
        nameColumns.map((c) => cellText(row[c])).filter(Boolean).join(" "),
        titleStat ? cellText(row[titleStat.column]) : "",
      ].filter(Boolean),
    )
    .filter((entry) => entry.length > 0);
  return { entries, columns: null };
}

export function rosterFromTable(table: readonly (readonly string[])[]): Roster {
  const rows = table.filter((row) => row.some((cell) => clean(cell).length > 0));
  const header = findHeader(rows);
  return header ? fromHeader(rows, header) : guessColumns(rows);
}

/** Rader för textrutan under "Fler namn". */
export function rosterText(entries: readonly (readonly string[])[]): string {
  return entries.map((entry) => entry.join(", ")).join("\n");
}
