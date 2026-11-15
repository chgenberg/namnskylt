import type { Sql, TransactionSql } from "postgres";

/** Sparar bilden under sitt id. Samma bild igen ändrar ingenting. */
export async function insertLogoImage(sql: Sql | TransactionSql, id: string, png: Uint8Array): Promise<void> {
  await sql`insert into logo_images (id, png) values (${id}, ${Buffer.from(png)}) on conflict (id) do nothing`;
}

/** Bilderna med de här id:na. Ett id som saknas finns inte med i svaret. */
export async function selectLogoImages(sql: Sql | TransactionSql, ids: readonly string[]): Promise<Map<string, Buffer>> {
  if (ids.length === 0) return new Map();
  const rows = await sql<{ id: string; png: Buffer }[]>`select id, png from logo_images where id in ${sql([...ids])}`;
  return new Map(rows.map((row) => [row.id, row.png]));
}

export interface LogoOriginalRow {
  id: string;
  mime: string;
  name: string | null;
  bytes: Buffer;
}

/** Sparar originalfilen under sitt id. Samma fil igen ändrar ingenting. */
export async function insertLogoOriginal(
  sql: Sql | TransactionSql,
  file: { id: string; mime: string; name: string | null; bytes: Uint8Array },
): Promise<void> {
  await sql`
    insert into logo_originals (id, mime, name, bytes)
    values (${file.id}, ${file.mime}, ${file.name}, ${Buffer.from(file.bytes)})
    on conflict (id) do nothing`;
}

export async function selectLogoOriginal(sql: Sql | TransactionSql, id: string): Promise<LogoOriginalRow | null> {
  const [row] = await sql<LogoOriginalRow[]>`select id, mime, name, bytes from logo_originals where id = ${id}`;
  return row ?? null;
}

export interface LogoOriginalInfo {
  id: string;
  mime: string;
  name: string | null;
  sizeBytes: number;
}

/** Namn, typ och storlek för filerna med de här id:na, utan själva filerna. Ett id som saknas finns inte med. */
export async function selectLogoOriginalInfo(sql: Sql | TransactionSql, ids: readonly string[]): Promise<LogoOriginalInfo[]> {
  if (ids.length === 0) return [];
  const rows = await sql<{ id: string; mime: string; name: string | null; size_bytes: number }[]>`
    select id, mime, name, octet_length(bytes)::int as size_bytes from logo_originals where id in ${sql([...ids])}`;
  return rows.map((row) => ({ id: row.id, mime: row.mime, name: row.name, sizeBytes: row.size_bytes }));
}

/**
 * Kolumner där skyltar sparas i dag. Städningen läser alla JSON-kolumner i
 * databasen, så en ny tabell kommer med av sig själv; listan finns för att
 * städningen ska vägra köra om någon av de här inte gick att hitta.
 */
const BADGE_COLUMNS: readonly (readonly [table: string, column: string])[] = [
  ["orders", "badges"],
  ["quotes", "badges"],
  ["designs", "doc"],
  ["shops", "data"],
  ["shops", "options"],
  ["shops", "content"],
  ["shops", "draft"],
  ["shop_content_versions", "content"],
  ["outreach_assets", "badge"],
  ["checkouts", "payload"],
];

/** Id:n som nämns i någon JSON-kolumn i databasen: allt som ser ut som en SHA-256. */
async function mentionedFileIds(sql: Sql | TransactionSql): Promise<Set<string>> {
  const columns = await sql<{ table_name: string; column_name: string }[]>`
    select table_name, column_name from information_schema.columns
     where table_schema = current_schema() and data_type in ('json', 'jsonb')`;
  const found = new Set(columns.map((column) => `${column.table_name}.${column.column_name}`));
  const missing = BADGE_COLUMNS.filter(([table, column]) => !found.has(`${table}.${column}`));
  if (missing.length > 0) {
    throw new Error(`Städningen av loggor hittar inte ${missing.map((pair) => pair.join(".")).join(", ")} och tar därför inte bort något`);
  }
  const mentioned = new Set<string>();
  for (const { table_name: table, column_name: column } of columns) {
    const rows = await sql<{ id: string }[]>`
      select distinct m[1] as id
        from ${sql(table)} t
       cross join lateral regexp_matches(t.${sql(column)}::text, '[0-9a-f]{64}', 'g') m`;
    for (const row of rows) mentioned.add(row.id);
  }
  return mentioned;
}

/**
 * Tar bort bilder och originalfiler som är äldre än `olderThanDays` och som
 * ingen skylt pekar på längre. En fil räknas som använd så fort dess id står
 * någonstans i en JSON-kolumn, vilken som helst: hellre en fil för mycket kvar
 * än en som används borta. Svarar med antalet borttagna.
 */
export async function deleteUnusedLogoRows(
  sql: Sql | TransactionSql,
  olderThanDays: number,
): Promise<{ images: number; originals: number }> {
  // Aldrig kortare än ett dygn: en nyuppladdad logga hör inte till någon order än.
  const days = Math.max(1, Math.floor(olderThanDays));
  const [oldImages, oldOriginals] = [
    await sql<{ id: string }[]>`select id from logo_images where created_at < now() - make_interval(days => ${days})`,
    await sql<{ id: string }[]>`select id from logo_originals where created_at < now() - make_interval(days => ${days})`,
  ];
  if (oldImages.length === 0 && oldOriginals.length === 0) return { images: 0, originals: 0 };
  const mentioned = await mentionedFileIds(sql);
  const unused = (rows: readonly { id: string }[]) => rows.map((row) => row.id).filter((id) => !mentioned.has(id));
  const images = unused(oldImages);
  const originals = unused(oldOriginals);
  // Åldern kontrolleras igen i samma sats som tar bort.
  const removedImages =
    images.length > 0
      ? await sql<{ id: string }[]>`
          delete from logo_images where id in ${sql(images)} and created_at < now() - make_interval(days => ${days}) returning id`
      : [];
  const removedOriginals =
    originals.length > 0
      ? await sql<{ id: string }[]>`
          delete from logo_originals where id in ${sql(originals)} and created_at < now() - make_interval(days => ${days}) returning id`
      : [];
  return { images: removedImages.length, originals: removedOriginals.length };
}
