"use client";

import { useState, useTransition } from "react";
import { ClaimForm } from "@/features/invite/claim-form";
import { activateOutreachAction } from "./actions";
import styles from "./landing.module.css";

export interface ActivatePanelProps {
  token: string;
}

/** Först ett klick, sedan kontot — inbjudan skapas bara när någon faktiskt vill aktivera. */
export function ActivatePanel({ token }: ActivatePanelProps) {
  const [invite, setInvite] = useState<{ token: string; email: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (invite) return <ClaimForm token={invite.token} email={invite.email} submitLabel="Aktivera butiken" />;

  return (
    <div className={styles.activateStart}>
      <button
        type="button"
        className="btn btn--primary btn--lg"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await activateOutreachAction(token);
            if (result.ok) setInvite({ token: result.inviteToken, email: result.email });
            else setError(result.error);
          })
        }
      >
        {pending ? "Förbereder…" : "Aktivera butiken"}
      </button>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
