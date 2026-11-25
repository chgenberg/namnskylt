/**
 * Rullar fram ett element i panelen, med överkanten först. I bladet på telefon rullar bara bladet:
 * `scrollIntoView` rullar också sidan, och i en butik, där sidfoten står under skyltmotorn, flyttade
 * det hela sidan uppåt utan väg tillbaka (sidan går inte att rulla medan bladet visas).
 */
export function revealInPanel(element: Element, behavior: ScrollBehavior): void {
  const body = element.closest<HTMLElement>("[data-sheet] [data-sheet-body]");
  if (!body) {
    element.scrollIntoView({ block: "start", behavior });
    return;
  }
  const top = element.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
  body.scrollTo({ top, behavior });
}
