/**
 * Skapar ett återförsäljarkonto med eget inlogg.
 *
 *   tsx --conditions=react-server scripts/create-reseller.ts <id> "<namn>" <e-post> [lösenord]
 *
 * Utan lösenord slumpas ett och skrivs ut en gång — spara det direkt.
 */
import { randomBytes } from "node:crypto";
import { createAccount } from "@/lib/reseller-auth/accounts";

async function main() {
  const [id, name, email, given] = process.argv.slice(2);
  if (!id || !name || !email) throw new Error("Ange id, namn och e-post");
  const password = given ?? `${randomBytes(9).toString("base64url")}`;
  await createAccount({ id, name, email, password });
  console.log(`Konto ${id} (${name}) skapat för ${email}`);
  if (!given) console.log(`Lösenord: ${password}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
