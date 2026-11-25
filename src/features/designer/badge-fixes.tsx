"use client";

import { createContext, useContext, useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { badgeFixes, badgeProblems, type BadgeDocument, type BadgeFix, type BadgeLayout, type FixTarget, type FontEngine } from "@/engine";
import { logoColorCombo } from "@/lib/brand/match";

/** Den senaste rättningen, så länge skylten är som rättningen lämnade den. */
interface AppliedFix {
  target: FixTarget;
  done: string;
  before: BadgeDocument;
  after: BadgeDocument;
}

/** En begäran om fokus efter ett tryck: knappen eller Ångra vid anmärkningen. */
interface FixFocus {
  target: FixTarget;
  seq: number;
}

interface BadgeFixesValue {
  /** Anmärkningen finns på skylten, med eller utan knapp. */
  has: (target: FixTarget) => boolean;
  /** Rättningen för anmärkningen, när den går att göra säkert. */
  fixFor: (target: FixTarget) => BadgeFix | null;
  applied: AppliedFix | null;
  focus: FixFocus | null;
  apply: (fix: BadgeFix) => void;
  undo: () => void;
}

const BadgeFixesContext = createContext<BadgeFixesValue | null>(null);
const NO_FIXES: readonly BadgeFix[] = [];

interface BadgeFixesProviderProps {
  doc: BadgeDocument;
  layout: BadgeLayout;
  fonts: FontEngine;
  /** Lägger en hel skylt i editorn, som när kunden själv ändrar något. */
  onLoad: (doc: BadgeDocument) => void;
  children: ReactNode;
}

/** Skyltmotorns förslag på yta ur loggans färger, samma som raden "Närmast i plast … Välj". */
function logoColorIdsOf(doc: BadgeDocument): readonly string[] {
  const colors = doc.logo?.colors;
  if (!colors || colors.length === 0) return [];
  const id = logoColorCombo({ materialId: doc.materialId, logoColors: colors, siteColors: [], printedInColor: true });
  return id ? [id] : [];
}

/**
 * Rättningarna för skylten i editorn (beslut av ägaren 2026-11-24, efter granskaren i Merchin),
 * delade av panelen och stegrutan, så att varje sektion visar knappen vid sin egen varning.
 * Reglerna ligger i motorn (`badgeFixes`). Knapparna räknas på en uppskjuten skylt, så att
 * skrivandet inte väntar på dem, och står kvar så länge varningen gör det (annars blinkade de vid
 * varje tecken). När en knapp trycks räknas rättningen om på skylten som står i editorn just då:
 * en rättning av en äldre skylt skulle annars ta bort det senaste kunden skrev.
 */
export function BadgeFixesProvider({ doc, layout, fonts, onLoad, children }: BadgeFixesProviderProps) {
  const problems = useMemo(() => badgeProblems(doc, layout), [doc, layout]);
  const deferred = useDeferredValue(doc);
  // Utan anmärkningar räknas ingenting: det vanliga fallet kostar inget medan kunden skriver.
  const hasProblems = problems.length > 0;
  const computed = useMemo(
    () => (hasProblems ? badgeFixes(deferred, fonts, { logoColorIds: logoColorIdsOf(deferred) }) : NO_FIXES),
    [hasProblems, deferred, fonts],
  );
  const [last, setLast] = useState<AppliedFix | null>(null);
  // Raden "Ändrat" gäller tills kunden ändrar något annat.
  const applied = last && last.after === doc ? last : null;
  /** Knappen eller Ångra som ska få fokus efter ett tryck, så att den som använder tangentbordet inte tappar platsen. */
  const [focus, setFocus] = useState<FixFocus | null>(null);

  const value = useMemo<BadgeFixesValue>(() => {
    const has = (target: FixTarget) => problems.some((problem) => problem.target === target);
    return {
      has,
      fixFor: (target) => (has(target) ? (computed.find((fix) => fix.target === target) ?? null) : null),
      applied,
      focus,
      apply: (shown) => {
        const fix = badgeFixes(doc, fonts, { layout, logoColorIds: logoColorIdsOf(doc) }).find((x) => x.target === shown.target);
        if (!fix) return;
        setLast({ target: fix.target, done: fix.done, before: doc, after: fix.doc });
        setFocus((current) => ({ target: fix.target, seq: (current?.seq ?? 0) + 1 }));
        onLoad(fix.doc);
      },
      undo: () => {
        if (!applied) return;
        setLast(null);
        setFocus((current) => ({ target: applied.target, seq: (current?.seq ?? 0) + 1 }));
        onLoad(applied.before);
      },
    };
  }, [problems, computed, applied, focus, doc, layout, fonts, onLoad]);
  return <BadgeFixesContext.Provider value={value}>{children}</BadgeFixesContext.Provider>;
}

/** Rättningarna för skylten i editorn. Utanför skyltmotorn finns inga, och då ritas inga knappar. */
export function useBadgeFixes(): BadgeFixesValue | null {
  return useContext(BadgeFixesContext);
}
