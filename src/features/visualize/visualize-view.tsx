"use client";

import { Segmented } from "@/components/ui/segmented";
import { PeopleGallery } from "./people-gallery";
import { TryOn } from "./try-on";
import type { VisualizeState } from "./use-visualize";
import styles from "./visualize.module.css";

const MODE_OPTIONS = [
  { id: "people", label: "Tre personer" },
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
      {state.mode === "people" ? <PeopleGallery state={state} /> : <TryOn state={state} />}
    </div>
  );
}
