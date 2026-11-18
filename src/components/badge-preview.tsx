"use client";

import { useId, useMemo } from "react";
import { isBlankBadge, layoutBadge, renderBadgeSvg, type BadgeDocument } from "@/engine";
import { useFontEngine } from "@/hooks/use-font-engine";
import styles from "./badge-preview.module.css";

const PLACEHOLDER_TEXTS = ["Ditt namn", "Titel", "Avdelning"];

interface BadgePreviewProps {
  doc: BadgeDocument;
  showDimensions?: boolean;
  className?: string;
  label?: string;
  /**
   * Rita grå platshållare på en skylt som ännu är helt tom. Bara där en skylt håller på att
   * skapas. En sparad skylt (korrektur, offert, order, varukorg) ritas alltid som den är:
   * utan text står där ingen text.
   */
  placeholders?: boolean;
}

/**
 * Tomma rader ritas som grå platshållare, så att kunden ser var texten hamnar. Bara på en skylt
 * som ännu är helt tom (`isBlankBadge`). Har skylten en logga eller text på någon rad ritas en
 * tom rad inte alls (besked via ägaren 2026-11-18, som såg "Ditt namn" stå kvar på en skylt som
 * inte skulle ha något namn).
 */
export function withPlaceholders(doc: BadgeDocument): { doc: BadgeDocument; ids: Set<string> } {
  const ids = new Set<string>();
  if (!isBlankBadge(doc)) return { doc, ids };
  const rows = doc.rows.map((row, i) => {
    if (row.text.trim()) return row;
    ids.add(row.id);
    return { ...row, text: PLACEHOLDER_TEXTS[i] ?? "" };
  });
  return { doc: { ...doc, rows }, ids };
}

export function BadgePreview({ doc, showDimensions = false, className, label, placeholders = false }: BadgePreviewProps) {
  const fonts = useFontEngine();
  const idPrefix = useId().replace(/:/g, "");

  const markup = useMemo(() => {
    const { doc: drawn, ids } = placeholders ? withPlaceholders(doc) : { doc, ids: new Set<string>() };
    return renderBadgeSvg(drawn, layoutBadge(drawn, fonts), {
      mode: "preview",
      fonts,
      showDimensions,
      placeholderRowIds: ids,
      idPrefix,
    });
  }, [doc, fonts, showDimensions, idPrefix, placeholders]);

  return (
    <div
      role="img"
      aria-label={label ?? `Namnskylt: ${doc.rows.map((r) => r.text).filter(Boolean).join(", ")}`}
      className={`${styles.preview} ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
