/**
 * Hur långt ett besök kom i skyltmotorn. Stegen står i den ordning ett besök
 * går igenom dem, och ett besök räknas till det steg det kom längst till. Ett
 * besök som öppnar kassan utan att ha ändrat något räknas alltså också till
 * stegen före.
 */
export const DESIGNER_STEPS = ["open", "text", "choice", "checkout", "submitted", "ordered"] as const;
export type DesignerStep = (typeof DESIGNER_STEPS)[number];

/** Sidospår som inte hör till trappan: varukorgen används av den som beställer flera designer. */
export const DESIGNER_SIDE_STEPS = ["cart"] as const;

/** Allt skyltmotorn får rapportera. */
export const DESIGNER_EVENT_STEPS = [...DESIGNER_STEPS, ...DESIGNER_SIDE_STEPS] as const;
export type DesignerEventStep = (typeof DESIGNER_EVENT_STEPS)[number];

/** Stegen som kassan rapporterar. */
export type CheckoutStep = Extract<DesignerStep, "checkout" | "submitted" | "ordered">;

export const DESIGNER_STEP_LABEL: Record<DesignerEventStep, string> = {
  open: "Skyltmotorn öppnad",
  text: "Text skriven",
  choice: "Val gjort",
  checkout: "Kassan öppnad",
  submitted: "Order skickad",
  ordered: "Order mottagen",
  cart: "Lagt i varukorgen",
};

/** Vad steget betyder, för den som läser statistiken. */
export const DESIGNER_STEP_HINT: Record<DesignerStep, string> = {
  open: "Besökaren kom till skyltmotorn.",
  text: "Skylten fick ett namn eller en annan text.",
  choice: "Material, form, ram, typsnitt, fäste eller logga valdes.",
  checkout: "Besökaren tryckte på Beställ.",
  submitted: "Formuläret i kassan skickades.",
  ordered: "Ordern togs emot. En kortbetalning räknas hit när den är betald.",
};

export const DESIGNER_EVENTS_PATH = "/api/designer-events";
/** Besökets slumpade id. Det finns bara i sidans minne och säger inget om vem besökaren är. */
export const VISIT_ID_PATTERN = /^[0-9a-f]{16,32}$/;
/** Skyltmotorn på namnskylt.com; i en butik är det butikens adress som anges. */
export const WEB_SCOPE = "web";
/** Tratten visar de senaste dagarna. */
export const FUNNEL_DAYS = 30;
/** Under så här många besök säger procentsatser ingenting. */
export const FUNNEL_MIN_VISITS = 10;

export interface FunnelStep {
  step: DesignerStep;
  label: string;
  /** Besök som kom minst så här långt. */
  visits: number;
  /** Andelen av föregående steg som gick vidare hit, i hela procent. `null` för första steget och när föregående är tomt. */
  keptPercent: number | null;
}

export interface FunnelDrop {
  from: DesignerStep;
  to: DesignerStep;
  /** Besök som kom till `from` men inte till `to`. */
  left: number;
  /** Besök som kom till `from`. */
  of: number;
}

export interface Funnel {
  /** Alla besök i perioden. */
  visits: number;
  steps: FunnelStep[];
  /** Övergången där flest besök försvinner; `null` utan besök eller när ingen lämnar. */
  biggestDrop: FunnelDrop | null;
  /** Falskt när besöken är för få för att procentsatserna ska säga något. */
  enough: boolean;
}

/**
 * Tratten ur antalet besök per längsta steg. `furthest[i]` är antalet besök
 * som kom till steg `i` i `DESIGNER_STEPS` men inte längre.
 */
export function funnel(furthest: readonly number[]): Funnel {
  const counts = DESIGNER_STEPS.map((_, i) => {
    const count = furthest[i] ?? 0;
    return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  });
  // Ett besök som kom till ett steg har också kommit till alla steg före.
  const reached = counts.map((_, i) => counts.slice(i).reduce((sum, count) => sum + count, 0));
  const steps = DESIGNER_STEPS.map((step, i): FunnelStep => {
    const previous = i > 0 ? (reached[i - 1] ?? 0) : 0;
    return {
      step,
      label: DESIGNER_STEP_LABEL[step],
      visits: reached[i] ?? 0,
      keptPercent: i > 0 && previous > 0 ? Math.round(((reached[i] ?? 0) / previous) * 100) : null,
    };
  });
  let biggestDrop: FunnelDrop | null = null;
  for (let i = 0; i < DESIGNER_STEPS.length - 1; i++) {
    const from = DESIGNER_STEPS[i];
    const to = DESIGNER_STEPS[i + 1];
    const of = reached[i] ?? 0;
    const left = of - (reached[i + 1] ?? 0);
    // Vid lika stora tapp gäller det första: det är dit flest besök når.
    if (from && to && left > 0 && left > (biggestDrop?.left ?? 0)) biggestDrop = { from, to, left, of };
  }
  const visits = reached[0] ?? 0;
  return { visits, steps, biggestDrop, enough: visits >= FUNNEL_MIN_VISITS };
}

/** Meningen som pekar ut var flest lämnar, till exempel "Flest lämnar mellan Text skriven och Kassan öppnad: 62 av 80." */
export function biggestDropText(drop: FunnelDrop): string {
  return `Flest lämnar mellan ${DESIGNER_STEP_LABEL[drop.from]} och ${DESIGNER_STEP_LABEL[drop.to]}: ${drop.left} av ${drop.of}.`;
}
