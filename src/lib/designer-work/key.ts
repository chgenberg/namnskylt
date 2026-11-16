/**
 * Nyckeln till skyltmotorns sparade arbete i webbläsaren. Ligger i en egen fil
 * utan beroenden, så att en sida som bara ska ta bort det sparade inte laddar
 * hela skyltmotorn.
 */

/** Formatets version. Höjs när det sparade inte längre går att läsa som förut; äldre sparat kastas då. */
export const SAVED_WORK_VERSION = 1;

/** Var skyltmotorn är öppnad. Varje sammanhang har sitt eget sparade arbete. */
export type WorkScope =
  | { kind: "web" }
  | { kind: "shop"; slug: string }
  /** En återförsäljare som designar åt en kund. Varukorgen blir en order eller en offert först när den är klar. */
  | { kind: "reseller"; customerId: string };

/** Nyckeln i `localStorage`. Versionen står i nyckeln, så att ett nytt format aldrig läser ett gammalt. */
export function savedWorkKey(scope: WorkScope): string {
  const prefix = `namnskylt:skyltmotor:v${SAVED_WORK_VERSION}`;
  if (scope.kind === "shop") return `${prefix}:butik:${scope.slug}`;
  if (scope.kind === "reseller") return `${prefix}:kund:${scope.customerId}`;
  return `${prefix}:web`;
}
