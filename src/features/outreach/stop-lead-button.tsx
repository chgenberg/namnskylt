"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { stopLeadAction } from "./actions";

/** Avbryter kommande steg för leadet; adressen spärras inte. */
export function StopLeadButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn btn--ghost"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await stopLeadAction(leadId);
          router.refresh();
        })
      }
    >
      Stoppa sekvensen
    </button>
  );
}
