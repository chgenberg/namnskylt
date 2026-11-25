"use client";

import { useEffect } from "react";
import { recordDemoVisitAction } from "./actions";

/** Räknar besöket från utskicksmejlet först i webbläsaren; skannrar som bara hämtar sidan räknas inte. */
export function DemoBeacon({ token }: { token: string }) {
  useEffect(() => {
    void recordDemoVisitAction(token).catch(() => undefined);
  }, [token]);
  return null;
}
