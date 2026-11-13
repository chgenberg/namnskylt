"use client";

import { useEffect } from "react";
import { recordLandingAction } from "./actions";

export interface LandingBeaconProps {
  token: string;
}

/** Räknar besöket först i webbläsaren; skannrar som bara hämtar sidan räknas inte. */
export function LandingBeacon({ token }: LandingBeaconProps) {
  useEffect(() => {
    void recordLandingAction(token).catch(() => undefined);
  }, [token]);
  return null;
}
