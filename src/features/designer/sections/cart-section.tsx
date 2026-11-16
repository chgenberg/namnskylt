"use client";

import { BadgePreview } from "@/components/badge-preview";
import { PanelSection } from "@/components/ui/panel-section";
import { batchLine, getColor, getMaterial, groupBadges, groupQuantity, type BadgeGroup } from "@/engine";
import styles from "./sections.module.css";

interface CartSectionProps {
  /** Designerna som redan ligger i varukorgen, utöver skylten i editorn. */
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
  /**
   * Återförsäljarens varukorg: skylten i editorn hör inte till varukorgen
   * förrän den läggs dit, med knappen vid priset. Här visas då bara det som
   * ligger i varukorgen.
   */
  explicit?: boolean;
}

/** `3 namn · 6 st` för en design med flera namn, annars bara antalet. */
function groupSummary(group: BadgeGroup): string {
  const names = groupBadges(group).length;
  const quantity = groupQuantity(group);
  return names > 1 ? `${names} namn · ${quantity} st` : `${quantity} st`;
}

const designCount = (count: number) => (count === 1 ? "1 design" : `${count} designer`);

/**
 * Varukorgen: flera olika skyltar i samma order. En design läggs i korgen och
 * nästa börjar i editorn. Priset räknas på hela ordern, så trappsteget,
 * startkostnaden och frakten delas av alla skyltar. Korgen sparas i
 * webbläsaren (`useSavedWork`) och kommer tillbaka när sidan laddas om.
 */
export function CartSection({ groups, pending, canAdd, onAdd, onEdit, onRemove, onUndo, explicit = false }: CartSectionProps) {
  const counted = explicit ? groups.length : groups.length + (pending ? 0 : 1);
  return (
    <PanelSection step={7} title="Varukorg" aside={groups.length > 0 ? designCount(counted) : explicit ? "Tom" : "Fler designer"}>
      {groups.length === 0 ? (
        <p className={styles.batchLead}>
          {explicit
            ? "Lägg skylten i varukorgen när den är klar, med knappen vid priset. Från varukorgen lägger du en order eller skapar en offert. Flera olika designer går i samma order eller offert, med gemensam frakt."
            : "Behöver ni en annan yta, form eller fäste till några av skyltarna? Lägg skylten ovan i varukorgen och designa nästa. Allt beställs tillsammans med gemensam frakt, och priset per skylt räknas på hela antalet."}
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
                    <button type="button" className="chip" aria-label={`Ta bort ${batchLine(group.doc) || "skylten"} ur varukorgen`} onClick={() => onRemove(index)}>
                      Ta bort
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className={styles.hint} role="status">
            {explicit
              ? pending
                ? "Ändra öppnar en design igen, till exempel för att byta namn eller antal. Skriv ett nytt namn ovan för att designa en skylt till, eller gå vidare till offert eller order vid priset."
                : "Skylten i editorn ligger inte i varukorgen än."
              : pending
                ? "Ny skylt med samma design. Skriv namnet och ändra det som ska skilja, så läggs den i varukorgen."
                : "Skylten ovan ligger också i varukorgen."}
          </p>
        </>
      )}
      {/* Återförsäljaren lägger i varukorgen med knappen vid priset och ändrar en design med "Ändra". */}
      {!explicit && (
        <div className={styles.cartButtons}>
          {pending ? (
            <button type="button" className="btn" onClick={onUndo}>
              Ångra den nya skylten
            </button>
          ) : (
            <button type="button" className="btn" disabled={!canAdd} onClick={onAdd}>
              Lägg i varukorgen och designa en till
            </button>
          )}
        </div>
      )}
      {!canAdd && !pending && <p className={styles.hint}>Varukorgen är full. Lägg resten i en ny order.</p>}
    </PanelSection>
  );
}
