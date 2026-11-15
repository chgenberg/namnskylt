"use client";

import { useEffect } from "react";
import { savedWorkKey } from "@/lib/designer-work/key";

/**
 * Tar bort skyltmotorns sparade arbete på namnskylt.com. Visas när en order är
 * betald med kort: varukorgen ligger kvar under betalningen, eftersom kunden
 * kan avbryta, men ska inte komma tillbaka när ordern väl är lagd.
 */
export function ClearSavedWork() {
  useEffect(() => {
    try {
      window.localStorage.removeItem(savedWorkKey({ kind: "web" }));
    } catch {
      // Utan lagring finns det inget att ta bort.
    }
  }, []);
  return null;
}
