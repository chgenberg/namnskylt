"use client";

import { BLOCK_KINDS, BLOCK_LABEL, type BlockKind } from "@/lib/shops/content";
import { BlockIcon } from "./block-icons";
import { DRAG_KIND } from "./messages";
import styles from "./editor.module.css";

const HINT: Record<BlockKind, string> = {
  header: "Stor rubrik, ingress, bild",
  text: "Rubrik och text",
  imageText: "Bild bredvid text",
  gallery: "Flera bilder",
  steps: "Steg för steg",
  faq: "Frågor och svar",
  banner: "Kampanj i er färg",
  contact: "Era kontaktuppgifter",
};

/** Blocktyperna att dra in på sidan — eller klicka för att lägga sist. */
export function BlockPalette({ onAdd, disabled }: { onAdd: (kind: BlockKind) => void; disabled: boolean }) {
  return (
    <div className={styles.palette} aria-label="Block att lägga till">
      {BLOCK_KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          className={styles.paletteItem}
          draggable={!disabled}
          disabled={disabled}
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_KIND, kind);
            e.dataTransfer.effectAllowed = "copy";
          }}
          onClick={() => onAdd(kind)}
          title="Dra in på sidan, eller klicka för att lägga sist"
        >
          <BlockIcon kind={kind} />
          <span>
            <strong>{BLOCK_LABEL[kind]}</strong>
            <small>{HINT[kind]}</small>
          </span>
        </button>
      ))}
    </div>
  );
}
