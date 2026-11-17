"use client";

import { BadgePreview } from "@/components/badge-preview";
import { batchLine, getColor, getMaterial, groupBadges, groupQuantity, type BadgeGroup } from "@/engine";
import styles from "./sections.module.css";

interface CartListProps {
  /** Designerna som ligger i varukorgen. */
  groups: readonly BadgeGroup[];
  /** Öppnar en design ur varukorgen i editorn; den som redigerades tar dess plats. */
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
}

/** `3 namn · 6 st` för en design med flera namn, annars bara antalet. */
function groupSummary(group: BadgeGroup): string {
  const names = groupBadges(group).length;
  const quantity = groupQuantity(group);
  return names > 1 ? `${names} namn · ${quantity} st` : `${quantity} st`;
}

/**
 * Det som ligger i varukorgen: en rad per design, med sina namn och antal.
 * Flera olika skyltar går i samma order eller offert. Priset räknas på hela
 * ordern, så trappsteget, startkostnaden och frakten delas av alla skyltar.
 * Korgen sparas i webbläsaren (`useSavedWork`) och kommer tillbaka när sidan
 * laddas om.
 */
export function CartList({ groups, onEdit, onRemove }: CartListProps) {
  return (
    <ul className={styles.cartList}>
      {groups.map((group, index) => {
        const material = getMaterial(group.doc.materialId);
        const title = batchLine(group.doc);
        return (
          <li key={index} className={styles.cartItem}>
            <BadgePreview doc={group.doc} className={styles.cartPreview} label={`Skylt: ${title || "utan text"}`} />
            <div className={styles.cartText}>
              <strong>{title || "Utan text"}</strong>
              <span>
                {groupSummary(group)} · {material.name}, {getColor(group.doc.materialId, group.doc.colorId).name.toLowerCase()}
              </span>
            </div>
            <div className={styles.cartActions}>
              <button type="button" className="chip" aria-label={`Ändra ${title || "skylten"}`} onClick={() => onEdit(index)}>
                Ändra
              </button>
              <button type="button" className="chip" aria-label={`Ta bort ${title || "skylten"} ur varukorgen`} onClick={() => onRemove(index)}>
                Ta bort
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
