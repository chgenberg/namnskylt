"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { accountErasureSummary, type AccountErasure } from "@/lib/orders/erase-model";
import { DangerDialog } from "./danger-dialog";
import { accountErasurePlanAction, deleteAccountAction } from "./erase-actions";
import styles from "./admin.module.css";

interface DeleteAccountButtonProps {
  accountId: string;
  name: string;
}

/** Tar bort ett återförsäljarkonto med kunder, offerter, ordrar och butik. Bara för admin. */
export function DeleteAccountButton({ accountId, name }: DeleteAccountButtonProps) {
  const router = useRouter();
  const [plan, setPlan] = useState<AccountErasure | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  // Räknas när dialogen öppnas, så att siffrorna gäller nu och inte när sidan ritades.
  const load = () => {
    setPlan(null);
    setPlanError(null);
    void accountErasurePlanAction(accountId).then((result) => {
      if (result.ok) setPlan(result.plan);
      else setPlanError(result.error);
    });
  };

  return (
    <DangerDialog
      label="Ta bort konto"
      title={<>Ta bort kontot {name}?</>}
      confirmLabel="Ta bort kontot"
      check="Jag förstår att det inte går att ångra"
      loading={!plan}
      onOpen={load}
      onConfirm={() => deleteAccountAction(accountId)}
      onDone={() => router.refresh()}
    >
      {plan ? (
        <p className={styles.muted}>{accountErasureSummary(plan)}</p>
      ) : planError ? (
        <p className={styles.error} role="alert">
          {planError}
        </p>
      ) : (
        <p className={styles.muted} role="status">
          Räknar vad som tas bort…
        </p>
      )}
      <p className={styles.muted}>
        Återförsäljaren kan inte logga in längre, och butiken slutar svara. Ordrar som behålls syns fortfarande under Tillverkning. Det går
        inte att ångra.
      </p>
    </DangerDialog>
  );
}
