import postgres, { type Sql } from "postgres";

let connection: Sql | null | undefined;

/**
 * En pool per process. `null` utan `DATABASE_URL` — sajten tar då fortfarande
 * emot ordrar och skickar dem vidare, men sparar dem inte.
 */
export function db(): Sql | null {
  if (connection !== undefined) return connection;
  const url = process.env.DATABASE_URL;
  connection = url
    ? postgres(url, {
        max: 5,
        idle_timeout: 30,
        ssl: process.env.DATABASE_SSL === "require" ? "require" : false,
        onnotice: () => undefined,
      })
    : null;
  return connection;
}

export function requireDb(): Sql {
  const sql = db();
  if (!sql) throw new Error("DATABASE_URL saknas");
  return sql;
}
