"use client";

import { Segmented } from "@/components/ui/segmented";
import { PersonPortrait } from "./person-portrait";
import { TryOn } from "./try-on";
import type { VisualizeState } from "./use-visualize";
import styles from "./visualize.module.css";

const MODE_OPTIONS = [
  { id: "person", label: "En person" },
  { id: "try-on", label: "Ditt foto" },
] as const;

interface VisualizeViewProps {
  state: VisualizeState;
}

export function VisualizeView({ state }: VisualizeViewProps) {
  return (
    <div className={styles.view}>
      <div className={styles.modeToggle}>
        <Segmented label="Bild" value={state.mode} options={MODE_OPTIONS} onChange={state.setMode} />
      </div>
      {state.mode === "person" ? <PersonPortrait state={state} /> : <TryOn state={state} />}
    </div>
  );
}
