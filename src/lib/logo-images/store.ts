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
