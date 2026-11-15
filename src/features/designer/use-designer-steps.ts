"use client";

import { useCallback, useRef } from "react";
import { DESIGNER_EVENTS_PATH, type DesignerEventStep } from "@/lib/designer-stats/model";
import type { DesignerAction } from "./state";

/** Ändringar som räknas som att besökaren har gjort ett val, utöver att skriva text. */
const CHOICE_ACTIONS: ReadonlySet<DesignerAction["type"]> = new Set([
  "font",
  "align",
  "material",
  "color",
  "blank",
  "custom/preset",
  "custom/outline",
  "custom/size",
  "custom/replace",
  "corner",
  "frame",
  "logo",
  "logo/placement",
  "logo/height",
  "mounting",
]);

export function isChoice(action: DesignerAction): boolean {
  return CHOICE_ACTIONS.has(action.type) && !(action.type === "logo" && action.logo === null);
}

/** Besökets id: slumpat, 16 hexadecimala tecken. Det finns bara i sidans minne och försvinner när sidan stängs. */
function randomVisitId(): string {
  const bytes = new Uint8Array(8);
  try {
    crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface DesignerSteps {
  /** Rapporterar ett steg, högst en gång per besök. */
  report: (step: DesignerEventStep) => void;
  /**
   * Besökets id, eller `null` när besöket inte räknas. Det följer med till
   * kortbetalningen, så att den betalda ordern räknas till samma besök.
   */
  visitId: () => string | null;
}

/**
 * Rapporterar hur långt besöket har kommit i skyltmotorn, varje steg högst en
 * gång. `scope` är `web` eller butikens adress; `null` stänger av rapporten,
 * till exempel när en återförsäljare lägger en order åt en kund. Inget sparas
 * hos besökaren och anropet väntar ingen på.
 */
export function useDesignerSteps(scope: string | null): DesignerSteps {
  const visit = useRef<string | null>(null);
  const sent = useRef(new Set<DesignerEventStep>());
  const visitId = useCallback(() => (scope ? (visit.current ??= randomVisitId()) : null), [scope]);
  const report = useCallback(
    (step: DesignerEventStep) => {
      if (!scope || sent.current.has(step)) return;
      sent.current.add(step);
      visit.current ??= randomVisitId();
      const body = JSON.stringify({ visit: visit.current, scope, step });
      try {
        // En textkropp går igenom överallt; servern läser den som JSON.
        if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon(DESIGNER_EVENTS_PATH, body)) return;
        void fetch(DESIGNER_EVENTS_PATH, { method: "POST", body, keepalive: true }).catch(() => undefined);
      } catch {
        // Statistiken får aldrig störa den som designar.
      }
    },
    [scope],
  );
  return { report, visitId };
}
