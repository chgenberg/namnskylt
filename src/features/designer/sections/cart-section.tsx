"use client";

import { BadgePreview } from "@/components/badge-preview";
import { PanelSection } from "@/components/ui/panel-section";
import { batchLine, getColor, getMaterial, groupBadges, groupQuantity, type BadgeGroup } from "@/engine";
import styles from "./sections.module.css";

interface CartSectionProps {
  /** Designerna som redan ligger i ordern, utöver skylten i editorn. */
  groups: readonly BadgeGroup[];
  /** Skylten i editorn är ny och orörd, och räknas inte in i ordern förrän den ändrats. */
  pending: boolean;
  /** Ordern rymmer fler skyltar. */
  canAdd: boolean;
  /** Lägger undan skylten i editorn och börjar på en ny med samma design. */
  onAdd: () => void;
  /** Öppnar en design ur ordern i editorn; den som redigerades tar dess plats. */
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
  /** Ångrar den nya skylten: senaste designen ur ordern tillbaka i editorn. */
  onUndo: () => void;
}

/** `3 namn · 6 st` för en design med flera namn, annars bara antalet. */
function groupSummary(group: BadgeGroup): string {
  const names = groupBadges(group).length;
  const quantity = groupQuantity(group);
  return names > 1 ? `${names} namn · ${quantity} st` : `${quantity} st`;
}

const designCount = (count: number) => (count === 1 ? "1 design" : `${count} designer`);

/**
 * Flera olika skyltar i samma order: en design läggs undan och nästa börjar i
 * editorn. Priset räknas på hela ordern, så trappsteget och startkostnaden
 * delas av alla skyltar.
 */
export function CartSection({ groups, pending, canAdd, onAdd, onEdit, onRemove, onUndo }: CartSectionProps) {
  return (
    <PanelSection step={7} title="Fler skyltar i ordern" aside={groups.length > 0 ? designCount(groups.length + (pending ? 0 : 1)) : "Annan design"}>
      {groups.length === 0 ? (
        <p className={styles.batchLead}>
          Behöver ni en annan yta, form eller fäste till några av skyltarna? Lägg skylten ovan i ordern och designa nästa.
          Alla hamnar på samma order och delar på startkostnad och frakt.
        </p>
      ) : (
        <>
          <ul className={styles.cartList}>
            {groups.map((group, index) => {
              const material = getMaterial(group.doc.materialId);
              return (
                <li key={index} className={styles.cartItem}>
                  <BadgePreview doc={group.doc} className={styles.cartPreview} label={`Skylt: ${batchLine(group.doc) || "utan text"}`} />
                  <div className={styles.cartText}>
                    <strong>{batchLine(group.doc) || "Utan text"}</strong>
                    <span>
                      {groupSummary(group)} · {material.name}, {getColor(group.doc.materialId, group.doc.colorId).name.toLowerCase()}
                    </span>
                  </div>
                  <div className={styles.cartActions}>
                    <button type="button" className="chip" onClick={() => onEdit(index)}>
                      Ändra
                    </button>
                    <button type="button" className="chip" aria-label={`Ta bort ${batchLine(group.doc) || "skylten"} ur ordern`} onClick={() => onRemove(index)}>
                      Ta bort
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className={styles.hint} role="status">
            {pending
              ? "Ny skylt med samma design. Skriv namnet och ändra det som ska skilja, så läggs den i ordern."
              : "Skylten ovan ligger också i ordern."}
          </p>
        </>
      )}
      <div className={styles.cartButtons}>
        {pending ? (
          <button type="button" className="btn" onClick={onUndo}>
            Ångra den nya skylten
          </button>
        ) : (
          <button type="button" className="btn" disabled={!canAdd} onClick={onAdd}>
            Lägg till en skylt med annan design
          </button>
        )}
      </div>
      {!canAdd && !pending && <p className={styles.hint}>Ordern är full. Lägg resten i en ny order.</p>}
    </PanelSection>
  );
}
