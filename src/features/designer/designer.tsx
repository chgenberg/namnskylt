"use client";

import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useReducer, useState } from "react";
import { BadgePreview } from "@/components/badge-preview";
import { Segmented } from "@/components/ui/segmented";
import { createBadgeDocument, getColor, getMaterial, layoutBadge, parseSmartInput } from "@/engine";
import { useTextMeasurer } from "@/hooks/use-text-measurer";
import styles from "./designer.module.css";
import { FormatSection } from "./sections/format-section";
import { MaterialSection } from "./sections/material-section";
import { MountingSection } from "./sections/mounting-section";
import { OrderSection } from "./sections/order-section";
import { TextSection } from "./sections/text-section";
import type { SpinFocus } from "./badge-3d";
import { designerReducer, type DesignerAction } from "./state";

const Badge3D = dynamic(() => import("./badge-3d"), {
  ssr: false,
  loading: () => <div className={styles.loading} aria-hidden="true" />,
});

type View = "3d" | "drawing";

const VIEW_OPTIONS = [
  { id: "3d", label: "3D" },
  { id: "drawing", label: "Ritning" },
] as const;

interface DesignerProps {
  initialText: string;
}

export function Designer({ initialText }: DesignerProps) {
  const [doc, dispatch] = useReducer(designerReducer, initialText, (text) =>
    createBadgeDocument(parseSmartInput(text)),
  );
  const [view, setView] = useState<View>("3d");
  const [spinning, setSpinning] = useState(true);
  const [focus, setFocus] = useState<SpinFocus | null>(null);
  const measure = useTextMeasurer();

  const update = useCallback((action: DesignerAction) => {
    dispatch(action);
    if (action.type === "quantity") return;
    setFocus({ side: action.type === "mounting" ? "back" : "front", key: performance.now() });
  }, []);
  const layout = useMemo(() => layoutBadge(doc, measure), [doc, measure]);

  const material = getMaterial(doc.materialId);
  const color = getColor(doc.materialId, doc.colorId);

  return (
    <div className={styles.shell}>
      <section className={`${styles.stage} dot-grid`} aria-label="Förhandsvisning">
        <div className={styles.stageTop}>
          <div className={styles.viewToggle}>
            <Segmented label="Vy" value={view} options={VIEW_OPTIONS} onChange={setView} />
          </div>
          {view === "3d" && (
            <button
              type="button"
              className={`chip ${styles.spinToggle}`}
              aria-pressed={spinning}
              onClick={() => setSpinning((s) => !s)}
            >
              <span className={styles.spinDot} data-on={spinning} aria-hidden="true" />
              {spinning ? "Snurrar" : "Pausad"}
            </button>
          )}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            className={styles.canvas}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {view === "3d" ? (
              <Badge3D doc={doc} measure={measure} spinning={spinning} focus={focus} />
            ) : (
              <div className={styles.drawing}>
                <BadgePreview doc={doc} showDimensions />
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <footer className={styles.stageBottom}>
          <p className={`mono ${styles.spec}`}>
            {doc.size.widthMm} × {doc.size.heightMm} mm · {material.name} · {color.name}
          </p>
          {view === "3d" && <p className={styles.hint}>Dra för att vrida skylten</p>}
        </footer>
      </section>

      <aside className={styles.panel} aria-label="Skyltmotor">
        <div className={styles.panelScroll}>
          <div className={styles.panelHead}>
            <p className="eyebrow">Skyltmotor</p>
            <h1 className={styles.panelTitle}>Din namnskylt</h1>
          </div>
          <TextSection doc={doc} layout={layout} dispatch={update} />
          <MaterialSection doc={doc} dispatch={update} />
          <FormatSection doc={doc} dispatch={update} />
          <MountingSection doc={doc} dispatch={update} />
        </div>
        <OrderSection doc={doc} dispatch={update} />
      </aside>
    </div>
  );
}
