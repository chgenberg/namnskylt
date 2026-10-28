import "server-only";
import { databaseConfigured } from "@/lib/orders/repository";
import { currentTenant } from "@/lib/reseller-auth/session";

/**
 * Varje adminsida kontrollerar själv — layouten körs inte om vid navigering
 * mellan undersidor, och sidans data får aldrig hämtas utan inloggning.
 * Svaret är återförsäljaren vars data sidan får visa.
 */
export async function adminTenant(): Promise<string | null> {
  return databaseConfigured() ? currentTenant() : null;
}
