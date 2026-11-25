"use client";

import { useEffect, useRef } from "react";
import type { FixTarget } from "@/engine";
import { useBadgeFixes } from "./badge-fixes";
import styles from "./fix-action.module.css";

interface FixActionProps {
  target: FixTarget;
  /** Bara raden om ändringen, aldrig knappen: för en plats där varningen inte står. */
  doneOnly?: boolean;
}

/**
 * Knappen som rättar en anmärkning, vid varningen den hör till, och efteråt "Ändrat: … Ångra" på
 * samma plats. Ritas där varningen står, också när varningen är borta, så att raden om ändringen
 * syns där kunden tryckte. Inline, så att den kan stå i en mening.
 */
export function FixAction({ target, doneOnly = false }: FixActionProps) {
  const fixes = useBadgeFixes();
  const button = useRef<HTMLButtonElement>(null);
  const handled = useRef(0);
  const showsUndo = fixes?.applied?.target === target;
  const fix = !fixes || showsUndo || doneOnly ? null : fixes.fixFor(target);
  // Knappen som trycktes försvinner: fokus går till Ångra efter en rättning, och till knappen efter Ångra.
  const focus = fixes?.focus;
  const rendered = showsUndo || Boolean(fix);
  useEffect(() => {
    if (!focus || focus.target !== target || focus.seq === handled.current || !rendered) return;
    handled.current = focus.seq;
    button.current?.focus({ preventScroll: true });
  }, [focus, target, rendered]);
  if (!fixes) return null;
  if (showsUndo && fixes.applied) {
    return (
      <span className={styles.done} role="status">
        Ändrat: {fixes.applied.done}.{" "}
        <button ref={button} type="button" className={styles.undo} onClick={fixes.undo}>
          Ångra
        </button>
      </span>
    );
  }
  if (!fix) return null;
  return (
    <button ref={button} type="button" className={styles.fix} onClick={() => fixes.apply(fix)}>
      {fix.label}
    </button>
  );
}
