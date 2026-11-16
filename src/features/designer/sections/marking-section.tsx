"use client";

import type { Dispatch } from "react";
import { PanelSection } from "@/components/ui/panel-section";
import {
  MARKING_METHODS,
  MARKING_MODE_NAME,
  getMarkingMethod,
  markingFits,
  markingOf,
  type BadgeDocument,
} from "@/engine";
import { formatSek } from "@/lib/format";
import { useShopPrices } from "../shop-price";
import type { DesignerAction } from "../state";
import styles from "./sections.module.css";

interface MarkingSectionProps {
  doc: BadgeDocument;
  dispatch: Dispatch<DesignerAction>;
  /** Trappsteget för orderns antal, som metodernas pris följer. */
  tierIndex: number;
}

/** En metod som ingår i skylten kostar inget; övriga visar sitt tillägg per skylt. */
function priceLabel(sek: number): string {
  return sek > 0 ? `+${formatSek(sek)}` : "Ingår";
}

/**
 * Märkningsmetoden: om namn och logotyp graveras eller printas. En metod ingår
 * i skylten. De två kombinerade valen kräver en logotyp och syns annars
 * streckade, så att ingen missar att de finns. Priserna kommer ur prismodellen
 * och följer orderns trappsteg och butikens påslag.
 */
export function MarkingSection({ doc, dispatch, tierIndex }: MarkingSectionProps) {
  const { markingPrice } = useShopPrices(tierIndex);
  const selected = getMarkingMethod(markingOf(doc));
  return (
    <PanelSection step={2} title="Märkningsmetod" aside="1 metod ingår">
      <div className={styles.markingList} role="radiogroup" aria-label="Märkningsmetod">
        {MARKING_METHODS.map((method) => {
          const available = markingFits(method.id, doc);
          return (
            <button
              key={method.id}
              type="button"
              role="radio"
              aria-checked={method.id === selected.id}
              // Går inte att välja, men går att nå med tangentbordet så att raden om logotypen blir läst.
              aria-disabled={available ? undefined : true}
              className={styles.markingOption}
              onClick={available ? () => dispatch({ type: "marking", method: method.id }) : undefined}
            >
              <span className={styles.markingRadio} aria-hidden="true" />
              <span className={styles.markingText}>
                <span className={styles.markingName}>{method.name}</span>
                <span className={styles.markingNote}>
                  {available ? method.description : `${method.description}. Lägg till en logotyp nedan för att välja.`}
                </span>
              </span>
              <span className={styles.markingPrice}>{priceLabel(markingPrice(method.id, doc.materialId))}</span>
            </button>
          );
        })}
      </div>
      <dl className={styles.markingSummary}>
        <div>
          <dt>Namn</dt>
          <dd>{MARKING_MODE_NAME[selected.nameMode]}</dd>
        </div>
        <div>
          <dt>Logotyp</dt>
          <dd>{doc.logo ? MARKING_MODE_NAME[selected.logoMode] : "Ingen logotyp"}</dd>
        </div>
        <div className={styles.markingTotal}>
          <dt>Pristillägg per skylt</dt>
          <dd>{priceLabel(markingPrice(selected.id, doc.materialId))}</dd>
        </div>
      </dl>
    </PanelSection>
  );
}
