"use client";

import { motion } from "motion/react";
import type { Dispatch } from "react";
import { PanelSection } from "@/components/ui/panel-section";
import { OFFERED_MOUNTINGS, getMounting, mountingFits, type BadgeDocument, type MountingId } from "@/engine";
import type { DesignerAction } from "../state";
import styles from "./sections.module.css";

/**
 * Fästenas ikoner, ritade i en ruta på 24 × 24. De visar samma former som
 * fästena har på skyltens baksida i 3D: nålen med sin ögla, hästskomagneten
 * med sina poler och klämman med sin flik.
 */
const MOUNTING_ICON: Record<MountingId, React.ReactNode> = {
  pin: (
    <>
      <path d="M2.5 12l3.9-.8h9.5v1.6H6.4z" fill="currentColor" stroke="none" />
      <circle cx="18.6" cy="12" r="2.7" />
    </>
  ),
  magnet: (
    <>
      <path d="M5.5 4h2A1.5 1.5 0 0 1 9 5.5V11a3 3 0 0 0 6 0V5.5A1.5 1.5 0 0 1 16.5 4h2A1.5 1.5 0 0 1 20 5.5V11a8 8 0 0 1-16 0V5.5A1.5 1.5 0 0 1 5.5 4z" />
      <path d="M4 8.2h5M15 8.2h5" />
    </>
  ),
  clip: (
    <>
      <path d="M9.7 3.5h5.8A1.5 1.5 0 0 1 17 5v8.5a1.5 1.5 0 0 1-1.5 1.5h-4.9a1.5 1.5 0 0 1-1.5-1.5V5.3" />
      <path d="M9.7 3.5a2.2 2.2 0 0 0-2.2 2.4l.9 8" />
      <path d="M8.4 13.9V19a1.5 1.5 0 0 0 1.5 1.5h5.6A1.5 1.5 0 0 0 17 19v-4.6" />
      <rect x="12.1" y="6.9" width="1.8" height="4.7" rx="0.8" />
    </>
  ),
  "safety-pin": <path d="M3.6 14.4c0-2.4 2.4-2.4 2.4 0s-2.4 2.4-2.4 0zM6 14.4h14.4M18 12.6l2.4 1.8-2.4 1.8" />,
};

interface MountingSectionProps {
  doc: BadgeDocument;
  dispatch: Dispatch<DesignerAction>;
}

/**
 * Fästets pris står i specifikationen vid antal och pris, inte här: det beror
 * på orderns antal. Ett fäste som inte finns på skyltens material syns ändå,
 * streckat och med en rad om var det finns, så att ingen missar att det finns.
 */
export function MountingSection({ doc, dispatch }: MountingSectionProps) {
  return (
    <PanelSection step={5} title="Fäste" aside={getMounting(doc.mounting).description}>
      <div className={styles.mountingGrid} role="radiogroup" aria-label="Fäste">
        {OFFERED_MOUNTINGS.map((m) => {
          const active = m.id === doc.mounting;
          const available = mountingFits(m.id, doc.materialId);
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={active}
              // Går inte att välja, men går att nå med tangentbordet så att raden om var fästet finns blir läst.
              aria-disabled={available ? undefined : true}
              className={styles.mountingCard}
              onClick={available ? () => dispatch({ type: "mounting", mounting: m.id }) : undefined}
            >
              {active && (
                <motion.span
                  layoutId="mounting-active"
                  className={styles.activeRing}
                  transition={{ type: "spring", stiffness: 480, damping: 38 }}
                />
              )}
              <svg
                viewBox="0 0 24 24"
                className={styles.mountingIcon}
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {MOUNTING_ICON[m.id]}
              </svg>
              <span className={styles.materialName}>{m.name}</span>
              {m.note && <span className={styles.mountingNote}>{m.note}</span>}
            </button>
          );
        })}
      </div>
    </PanelSection>
  );
}
