import "server-only";
import { notify } from "@/lib/notices/notify";
import { decideProof } from "./repository";

/**
 * Kunden svarar på sitt korrektur via länken, och den som äger ordern får
 * besked. `false` när korrekturet redan är besvarat.
 */
export async function answerProof(token: string, approved: boolean, comment: string | null): Promise<boolean> {
  const order = await decideProof(token, approved, comment);
  if (!order) return false;
  await notify({
    tenant: order.tenant,
    kind: approved ? "proof-approved" : "proof-changes",
    who: order.customerLabel,
    detail: approved ? null : comment,
    orderId: order.orderId,
  });
  return true;
}
