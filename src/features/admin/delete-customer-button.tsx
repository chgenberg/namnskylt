"use client";

import { useRouter } from "next/navigation";
import { customerErasureSummary, type CustomerErasure } from "@/lib/orders/erase-model";
import { DangerDialog } from "./danger-dialog";
import { deleteCustomerAction } from "./erase-actions";
import styles from "./admin.module.css";

interface DeleteCustomerButtonProps {
  customerId: string;
  /** Kundens namn som det står i rubriken. */
  name: string;
  /** Vad som tas bort och behålls, räknat när sidan ritades. */
  plan: CustomerErasure;
}

/** Tar bort kunden för gott. Ordrar som hör till bokföringen behålls utan personuppgifter. */
export function DeleteCustomerButton({ customerId, name, plan }: DeleteCustomerButtonProps) {
  const router = useRouter();
  return (
    <DangerDialog
      label="Ta bort kund"
      title={<>Ta bort {name}?</>}
      confirmLabel="Ta bort kunden"
      check="Jag förstår att det inte går att ångra"
      onConfirm={() => deleteCustomerAction(customerId)}
      onDone={() => router.replace("/admin/kunder")}
    >
      <p className={styles.muted}>{customerErasureSummary(plan)}</p>
      <p className={styles.muted}>
        Kundens namn, e-post, telefon och adress raderas, liksom namnen på skyltarna i de ordrar som behålls. Har kunden ett konto
        för inloggning tas det också bort. Det går inte att ångra.
      </p>
    </DangerDialog>
  );
}
