"use client";

import { useRouter } from "next/navigation";
import { DangerDialog } from "./danger-dialog";
import { deleteApplicationAction } from "./erase-actions";
import styles from "./admin.module.css";

interface DeleteApplicationButtonProps {
  id: string;
  company: string;
  /** Ansökan har redan blivit ett konto. Kontot tas bort för sig. */
  hasAccount: boolean;
}

/** Tar bort en ansökan med dess uppgifter. Bara för admin. */
export function DeleteApplicationButton({ id, company, hasAccount }: DeleteApplicationButtonProps) {
  const router = useRouter();
  return (
    <DangerDialog
      label="Ta bort"
      title={<>Ta bort ansökan från {company}?</>}
      confirmLabel="Ta bort ansökan"
      onConfirm={() => deleteApplicationAction(id)}
      onDone={() => router.refresh()}
    >
      <p className={styles.muted}>
        Ansökan med företagets och kontaktpersonens uppgifter tas bort, och en länk för att välja lösenord slutar gälla.{" "}
        {hasAccount ? "Kontot som skapades ur ansökan behålls; det tas bort för sig under Konton." : "Inget konto har skapats ur ansökan."} Det
        går inte att ångra.
      </p>
    </DangerDialog>
  );
}
