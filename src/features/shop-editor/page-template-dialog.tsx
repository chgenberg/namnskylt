"use client";

import { useEffect, useRef, useState } from "react";
import { BLOCK_LABEL } from "@/lib/shops/content";
import { PAGE_TEMPLATES, type PageTemplateId } from "@/lib/shops/page-templates";
import { BlockIcon } from "./block-icons";
import styles from "./editor.module.css";

interface PageTemplateDialogProps {
  creating: boolean;
  onCreate: (templateId: PageTemplateId, label: string) => void;
  onClose: () => void;
}

/** "+ Sida": färdiga sidor att börja från, eller en tom. */
export function PageTemplateDialog({ creating, onCreate, onClose }: PageTemplateDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [chosen, setChosen] = useState<PageTemplateId>("about");
  const template = PAGE_TEMPLATES.find((t) => t.id === chosen) ?? PAGE_TEMPLATES[0];
  const [label, setLabel] = useState(template?.label ?? "");
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  if (!template) return null;
  return (
    <dialog ref={ref} className={styles.dialog} onClose={onClose} onClick={(e) => e.target === ref.current && !creating && ref.current?.close()}>
      <header className={styles.dialogHead}>
        <div>
          <h2>Ny sida</h2>
          <p className={styles.hint}>Välj en färdig sida att börja från — allt går att ändra efteråt. Eller börja med en tom.</p>
        </div>
        <button type="button" className={styles.ghost} onClick={() => ref.current?.close()} disabled={creating}>
          Avbryt
        </button>
      </header>
      <div className={styles.templates} role="radiogroup" aria-label="Sidmallar">
        {PAGE_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={t.id === chosen}
            className={styles.templateCard}
            onClick={() => {
              setChosen(t.id);
              setLabel(t.id === "blank" ? "" : t.label);
            }}
            onDoubleClick={() => onCreate(t.id, t.id === "blank" ? label : t.label)}
          >
            <span className={styles.templateThumb} aria-hidden="true">
              {t.blocks.length === 0 ? (
                <span className={styles.templateBlank}>＋</span>
              ) : (
                t.blocks.map((kind, i) => (
                  <span key={i} className={styles.templateRow} data-kind={kind}>
                    <BlockIcon kind={kind} />
                    <i />
                  </span>
                ))
              )}
            </span>
            <strong>{t.label}</strong>
            <small>{t.description}</small>
            {t.blocks.length > 0 && <small className={styles.templateBlocks}>{t.blocks.map((k) => BLOCK_LABEL[k]).join(" · ")}</small>}
          </button>
        ))}
      </div>
      <form
        className={styles.templateFoot}
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(template.id, label);
        }}
      >
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Namn i menyn</span>
          <input value={label} maxLength={30} placeholder={template.id === "blank" ? "T.ex. Hållbarhet" : template.label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <button type="submit" className="btn btn--primary" disabled={creating || (template.id === "blank" && !label.trim())}>
          {creating ? (template.showcaseImages ? "Skapar sidan och bilderna…" : "Skapar…") : `Skapa ${template.id === "blank" ? "tom sida" : `sidan ${label || template.label}`}`}
        </button>
      </form>
    </dialog>
  );
}
