"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { AssetReview } from "@/lib/outreach/model";
import { reviewPersonaAction } from "./actions";
import { REVIEW_LABEL } from "./labels";
import styles from "./outreach.module.css";

interface PersonaReviewProps {
  assetId: string;
  review: AssetReview;
}

/** Godkänn eller avvisa en personbild. Avvisad eller ogranskad bild skickas aldrig; mejlet visar då skylten. */
export function PersonaReview({ assetId, review }: PersonaReviewProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const set = (next: AssetReview) =>
    startTransition(async () => {
      await reviewPersonaAction(assetId, next);
      router.refresh();
    });

  return (
    <div className={styles.controlRow}>
      <span className={styles.tag} data-tone={review === "approved" ? "ok" : review === "rejected" ? "warn" : undefined}>
        {REVIEW_LABEL[review]}
      </span>
      <span className={styles.spacer} />
      {review !== "approved" && (
        <button type="button" className="btn btn--primary" disabled={pending} onClick={() => set("approved")}>
          Godkänn
        </button>
      )}
      {review !== "rejected" && (
        <button type="button" className="btn btn--ghost" disabled={pending} onClick={() => set("rejected")}>
          Avvisa
        </button>
      )}
    </div>
  );
}
