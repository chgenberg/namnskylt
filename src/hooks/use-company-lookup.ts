"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { lookupNumber, type CompanyHit } from "@/lib/company/lookup-model";

/** Så länge väntar uppslaget efter senaste tangenttrycket, så att ett nummer som skrivs frågas en gång. */
const DELAY_MS = 300;

export type CompanyLookupStatus = "idle" | "loading" | "found" | "missing";

interface CompanyLookup {
  status: CompanyLookupStatus;
  /** Anropas när organisationsnumret ändras. Ett helt nummer slås upp, ett ofullständigt nollar läget. */
  lookup: (orgNumber: string) => void;
}

/**
 * Slår upp företagets uppgifter när kunden skriver sitt organisationsnummer
 * (besked av ägaren 2026-11-18). Uppslaget görs på den som skriver, aldrig på
 * ett nummer som redan står ifyllt. `onFound` får företaget och fyller i det
 * som är tomt. Går uppslaget inte fungerar formuläret som förut.
 */
export function useCompanyLookup(onFound: (company: CompanyHit) => void): CompanyLookup {
  const [status, setStatus] = useState<CompanyLookupStatus>("idle");
  const found = useRef(onFound);
  const asked = useRef("");
  const timer = useRef<number | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    found.current = onFound;
  });

  const cancel = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    request.current?.abort();
    timer.current = null;
    request.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const lookup = useCallback(
    (orgNumber: string) => {
      const digits = lookupNumber(orgNumber) ?? "";
      if (digits === asked.current) return;
      asked.current = digits;
      cancel();
      if (!digits) {
        setStatus("idle");
        return;
      }
      setStatus("loading");
      timer.current = window.setTimeout(() => {
        const controller = new AbortController();
        request.current = controller;
        fetch(`/api/company/lookup?orgNumber=${digits}`, { signal: controller.signal })
          .then((response) => (response.ok ? (response.json() as Promise<{ found?: boolean; company?: CompanyHit }>) : null))
          .then((body) => {
            if (controller.signal.aborted) return;
            if (body?.found && body.company) {
              found.current(body.company);
              setStatus("found");
            } else {
              // Utan svar (sajten är låst, gränsen är nådd eller något gick fel) sägs ingenting:
              // bara ett riktigt svar får påstå att numret inte finns i registret.
              setStatus(body ? "missing" : "idle");
            }
          })
          .catch(() => {
            if (!controller.signal.aborted) setStatus("idle");
          });
      }, DELAY_MS);
    },
    [cancel],
  );

  return { status, lookup };
}

/** Raden under fältet för organisationsnummer, eller `null` när inget ska sägas. */
export function companyLookupNote(status: CompanyLookupStatus): string | null {
  if (status === "loading") return "Hämtar företagets uppgifter…";
  if (status === "found") return "Företagets uppgifter är hämtade ur EU:s momsregister. Kontrollera att de stämmer.";
  return status === "missing" ? "Vi hittade inga uppgifter för numret. Fyll i dem själv." : null;
}
