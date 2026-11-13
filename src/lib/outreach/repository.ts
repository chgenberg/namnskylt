import "server-only";
import { requireDb } from "@/lib/db/client";

export * from "./store";

/** Appens anslutning; SQL-funktionerna i `store.ts` tar den som första argument. */
export function outreachDb() {
  return requireDb();
}
