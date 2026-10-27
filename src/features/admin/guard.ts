import "server-only";
import { databaseConfigured } from "@/lib/orders/repository";
import { isResellerSignedIn } from "@/lib/reseller-auth/session";

/**
 * Varje adminsida kontrollerar själv — layouten körs inte om vid navigering
 * mellan undersidor, och sidans data får aldrig hämtas utan inloggning.
 */
export async function canViewAdmin(): Promise<boolean> {
  return databaseConfigured() && (await isResellerSignedIn());
}
