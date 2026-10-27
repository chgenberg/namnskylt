"use client";

import { useState, useTransition } from "react";
import { createBadgeDocument, lineUnitPrices, MATERIALS, type MaterialId } from "@/engine";
import { formatSek } from "@/features/orders/format";
import { MAX_PURCHASE_DISCOUNT_PERCENT, purchasePrice, type PurchaseTerms } from "@/lib/orders/purchase";
import { savePurchaseTermsAction } from "./actions";
import styles from "./admin.module.css";

function parsePercent(text: string): number | null {
  const value = Number(text.replace(",", "."));
  return text.trim() === "" || !Number.isFinite(value) ? null : Math.min(MAX_PURCHASE_DISCOUNT_PERCENT, Math.max(0, value));
}

const EXAMPLES = MATERIALS.map((material) => ({
  material,
  badge: { ...createBadgeDocument(["Anna Lind", "Säljare"]), materialId: material.id, colorId: material.colors[0]?.id ?? "" },
}));

/** Inköpsrabatten hos tryckeriet: en generell procent och undantag per material. */
export function PurchaseTermsForm({ terms }: { terms: PurchaseTerms | null }) {
  const [general, setGeneral] = useState(String(terms?.generalPercent ?? ""));
  const [perMaterial, setPerMaterial] = useState<Partial<Record<MaterialId, string>>>(() =>
    Object.fromEntries(Object.entries(terms?.perMaterial ?? {}).map(([id, pct]) => [id, String(pct)])),
  );
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const draft: PurchaseTerms = {
    generalPercent: parsePercent(general) ?? 0,
    perMaterial: Object.fromEntries(
      Object.entries(perMaterial).flatMap(([id, text]) => {
        const pct = parsePercent(text ?? "");
        return pct === null ? [] : [[id, pct]];
      }),
    ),
  };

  const save = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await savePurchaseTermsAction(draft);
      setMessage(result.ok ? { ok: true, text: "Inköpspriserna är sparade" } : { ok: false, text: result.error });
    });
  };

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <label className={`${styles.discountField} ${styles.fitContent}`}>
        <span className={styles.formLabel}>Din rabatt på listpriset hos tryckeriet</span>
        <span className={styles.priceInput}>
          <input inputMode="decimal" value={general} placeholder="0" onChange={(e) => setGeneral(e.target.value)} aria-label="Generell inköpsrabatt i procent" />
          <span>%</span>
        </span>
      </label>

      <div className={styles.priceTable} role="table" aria-label="Inköpsrabatt per material">
        <div className={`${styles.priceHead} ${styles.purchaseGrid}`} role="row">
          <span role="columnheader">Material</span>
          <span role="columnheader">Egen rabatt</span>
          <span role="columnheader" className={styles.num}>
            Listpris
          </span>
          <span role="columnheader" className={styles.num}>
            Ditt inköp
          </span>
        </div>
        {EXAMPLES.map(({ material, badge }) => {
          const listSek = lineUnitPrices([badge])[0] ?? 0;
          return (
            <div key={material.id} className={`${styles.priceRow} ${styles.purchaseGrid}`} role="row">
              <span role="cell" className={styles.rowTitle}>
                <strong>{material.name}</strong>
                <span className={styles.muted}>70×25 mm, två rader</span>
              </span>
              <span role="cell">
                <label className={styles.priceInput}>
                  <span className="visually-hidden">Inköpsrabatt för {material.name}</span>
                  <input
                    inputMode="decimal"
                    value={perMaterial[material.id] ?? ""}
                    placeholder={String(draft.generalPercent)}
                    onChange={(e) => setPerMaterial((all) => ({ ...all, [material.id]: e.target.value }))}
                  />
                  <span>%</span>
                </label>
              </span>
              <span role="cell" className={`${styles.num} mono`}>
                {formatSek(listSek)}
              </span>
              <span role="cell" className={`${styles.num} mono`}>
                {formatSek(purchasePrice([badge], draft).totalSek)}
              </span>
            </div>
          );
        })}
      </div>
      <p className={styles.muted}>
        Tomt fält = den generella rabatten. Mängdrabatten räknas först, din rabatt sedan — samma ordning som hos tryckeriet.
      </p>

      <div className={styles.actionBar}>
        <button type="submit" className="btn btn--primary" disabled={pending}>
          {pending ? "Sparar…" : "Spara inköpspriser"}
        </button>
        {message && (
          <span className={message.ok ? styles.success : styles.error} role="status">
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
