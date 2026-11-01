"use client";

import { useState, type DragEvent, type ReactNode } from "react";
import { BLOCK_KINDS, BLOCK_LABEL, type Block, type BlockKind } from "@/lib/shops/content";
import { BlockIcon } from "./block-icons";
import { DRAG_BLOCK, DRAG_KIND, type BlockAction } from "./messages";
import styles from "./editor.module.css";

interface BlockListProps {
  blocks: readonly Block[];
  selectedId: string | null;
  disabled: boolean;
  onSelect: (blockId: string | null) => void;
  onAction: (blockId: string, action: BlockAction) => void;
  onMove: (blockId: string, index: number) => void;
  onDrop: (kind: BlockKind, index: number) => void;
  /** Formuläret för det valda blocket, under dess rad. */
  renderForm: (block: Block) => ReactNode;
}

function blockSummary(block: Block): string {
  const title = "title" in block && block.title ? block.title : "text" in block && block.text ? block.text : "";
  return title.split("\n")[0]?.slice(0, 48) ?? "";
}

const accepts = (e: DragEvent) => e.dataTransfer.types.includes(DRAG_KIND) || e.dataTransfer.types.includes(DRAG_BLOCK);

/** Sidans block i ordning. Dra för att flytta, släpp nya block från paletten mellan dem. */
export function BlockList({ blocks, selectedId, disabled, onSelect, onAction, onMove, onDrop, renderForm }: BlockListProps) {
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const over = (index: number) => (e: DragEvent<HTMLElement>) => {
    if (disabled || !accepts(e)) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    setDropAt(e.clientY < r.top + r.height / 2 ? index : index + 1);
  };

  const drop = (e: DragEvent) => {
    if (disabled || !accepts(e)) return;
    e.preventDefault();
    const index = dropAt ?? blocks.length;
    setDropAt(null);
    setDragging(null);
    const blockId = e.dataTransfer.getData(DRAG_BLOCK);
    const kind = e.dataTransfer.getData(DRAG_KIND);
    if (blockId) {
      const from = blocks.findIndex((b) => b.id === blockId);
      onMove(blockId, from >= 0 && from < index ? index - 1 : index);
    } else if ((BLOCK_KINDS as readonly string[]).includes(kind)) onDrop(kind as BlockKind, index);
  };

  if (blocks.length === 0) {
    return (
      <div
        className={styles.listEmpty}
        data-active={dropAt !== null || undefined}
        onDragOver={(e) => {
          if (!disabled && accepts(e)) {
            e.preventDefault();
            setDropAt(0);
          }
        }}
        onDragLeave={() => setDropAt(null)}
        onDrop={drop}
      >
        Sidan är tom. Dra in ett block hit eller i förhandsvisningen.
      </div>
    );
  }

  return (
    <ol className={styles.blocks} aria-label="Sidans block" onDrop={drop} onDragLeave={(e) => e.target === e.currentTarget && setDropAt(null)}>
      {blocks.map((block, index) => (
        <li
          key={block.id}
          className={styles.blockRow}
          data-selected={block.id === selectedId || undefined}
          data-dragging={dragging === block.id || undefined}
          data-drop-before={dropAt === index || undefined}
          data-drop-after={dropAt === blocks.length && index === blocks.length - 1 ? "" : undefined}
          onDragOver={over(index)}
        >
          <div className={styles.blockLine}>
            <span
              className={styles.grip}
              draggable={!disabled}
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_BLOCK, block.id);
                e.dataTransfer.effectAllowed = "move";
                setDragging(block.id);
              }}
              onDragEnd={() => {
                setDragging(null);
                setDropAt(null);
              }}
              aria-hidden="true"
              title="Dra för att flytta"
            >
              ⠿
            </span>
            <button
              type="button"
              className={styles.blockHead}
              onClick={() => onSelect(block.id === selectedId ? null : block.id)}
              aria-expanded={block.id === selectedId}
            >
              <span className={styles.blockIcon}>
                <BlockIcon kind={block.kind} />
              </span>
              <span>
                <strong>{BLOCK_LABEL[block.kind]}</strong>
                <small>{blockSummary(block) || "Tomt"}</small>
              </span>
            </button>
            {!disabled && (
              <span className={styles.itemActions}>
                <button type="button" aria-label="Flytta upp" disabled={index === 0} onClick={() => onAction(block.id, "up")}>
                  ↑
                </button>
                <button type="button" aria-label="Flytta ner" disabled={index === blocks.length - 1} onClick={() => onAction(block.id, "down")}>
                  ↓
                </button>
                <button type="button" aria-label="Kopiera" onClick={() => onAction(block.id, "duplicate")}>
                  ⧉
                </button>
                <button type="button" aria-label="Ta bort" onClick={() => onAction(block.id, "remove")}>
                  ✕
                </button>
              </span>
            )}
          </div>
          {block.id === selectedId && !disabled && <div className={styles.blockForm}>{renderForm(block)}</div>}
        </li>
      ))}
    </ol>
  );
}
