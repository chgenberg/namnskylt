"use client";

import { useId, useMemo } from "react";
import { layoutBadge, renderBadgeSvg, type BadgeDocument } from "@/engine";
import { useTextMeasurer } from "@/hooks/use-text-measurer";
import styles from "./badge-preview.module.css";

const PLACEHOLDER_TEXTS = ["Ditt namn", "Titel", "Avdelning"];

interface BadgePreviewProps {
  doc: BadgeDocument;
  showDimensions?: boolean;
  className?: string;
  label?: string;
}

/** Tomma rader ritas som grå platshållare så kunden ser var texten hamnar. */
function withPlaceholders(doc: BadgeDocument): { doc: BadgeDocument; ids: Set<string> } {
  const ids = new Set<string>();
  const rows = doc.rows.map((row, i) => {
    if (row.text.trim()) return row;
    ids.add(row.id);
    return { ...row, text: PLACEHOLDER_TEXTS[i] ?? "" };
  });
  return { doc: { ...doc, rows }, ids };
}

export function BadgePreview({ doc, showDimensions = false, className, label }: BadgePreviewProps) {
  const measure = useTextMeasurer();
  const idPrefix = useId().replace(/:/g, "");

  const markup = useMemo(() => {
    const { doc: drawn, ids } = withPlaceholders(doc);
    return renderBadgeSvg(drawn, layoutBadge(drawn, measure), {
      mode: "preview",
      showDimensions,
      placeholderRowIds: ids,
      idPrefix,
    });
  }, [doc, measure, showDimensions, idPrefix]);

  return (
    <div
      role="img"
      aria-label={label ?? `Namnskylt: ${doc.rows.map((r) => r.text).filter(Boolean).join(", ")}`}
      className={`${styles.preview} ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
