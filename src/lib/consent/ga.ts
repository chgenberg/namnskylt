import "server-only";
import { gaMeasurementIdOf } from "./model";

/** Google Analytics är på när `GA_MEASUREMENT_ID` är ett mätnings-id. Utan det visas ingen cookieruta. */
export function gaMeasurementId(env: Record<string, string | undefined> = process.env): string | null {
  return gaMeasurementIdOf(env.GA_MEASUREMENT_ID);
}
