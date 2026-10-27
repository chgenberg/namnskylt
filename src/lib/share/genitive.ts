/** Svensk genitiv: "Kalle Olssons", men "Lars" och "Max" utan extra s. */
export function genitive(name: string): string {
  return /[sxz]$/i.test(name) ? name : `${name}s`;
}
