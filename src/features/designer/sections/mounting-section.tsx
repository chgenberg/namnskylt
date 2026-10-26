"use client";

import { motion } from "motion/react";
import type { Dispatch } from "react";
import { PanelSection } from "@/components/ui/panel-section";
import { MOUNTINGS, getMounting, type BadgeDocument, type MountingId } from "@/engine";
import type { DesignerAction } from "../state";
import styles from "./sections.module.css";

const MOUNTING_ICON: Record<MountingId, React.ReactNode> = {
  pin: <path d="M3 12h14M15 10v4" />,
  magnet: (
    <>
      <rect x="4" y="7" width="12" height="10" rx="1.5" />
      <path d="M7 7V4M13 7V4" />
    </>
  ),
  clip: <path d="M7 3h6v14H7zM7 7h6" />,
  "safety-pin": <path d="M3 12c0-2 2-2 2 0s-2 2-2 0zM5 12h12M15 10.5l2 1.5-2 1.5" />,
};

interface MountingSectionProps {
  doc: BadgeDocument;
  dispatch: Dispatch<DesignerAction>;
}

export function MountingSection({ doc, dispatch }: MountingSectionProps) {
  return (
    <PanelSection step={4} title="Fäste" aside={getMounting(doc.mounting).description}>
      <div className={styles.mountingGrid} role="radiogroup" aria-label="Fäste">
        {MOUNTINGS.map((m) => {
          const active = m.id === doc.mounting;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={styles.mountingCard}
              onClick={() => dispatch({ type: "mounting", mounting: m.id })}
            >
              {active && (
                <motion.span
                  layoutId="mounting-active"
                  className={styles.activeRing}
                  transition={{ type: "spring", stiffness: 480, damping: 38 }}
                />
              )}
              <svg viewBox="0 0 20 20" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                {MOUNTING_ICON[m.id]}
              </svg>
              <span className={styles.materialName}>{m.name}</span>
              <span className={styles.materialPrice}>{m.priceSek ? `+${m.priceSek} kr` : "Ingår"}</span>
            </button>
          );
        })}
      </div>
    </PanelSection>
  );
}
