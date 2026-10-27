export type PrintScale = "actual" | "fit";

export function downloadFile(contents: string, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface PrintPage {
  svg: string;
  caption: string;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Skriver ut arken från en dold iframe, en skiva per sida. `actual` sätter
 * sidan till arkets mått så att utskriften blir 1:1 (plotter eller PDF);
 * `fit` skalar ner till A4 för granskning på kontorsskrivaren.
 */
export function printSheets(
  pages: readonly PrintPage[],
  sheet: { widthMm: number; heightMm: number },
  scale: PrintScale,
  title: string,
): void {
  const pageRule =
    scale === "actual" ? `size:${sheet.widthMm}mm ${sheet.heightMm}mm;margin:0` : "size:A4 portrait;margin:12mm";
  const pageBox =
    scale === "actual" ? `width:${sheet.widthMm}mm;height:${sheet.heightMm}mm` : "width:100%;height:calc(297mm - 25mm)";
  const body = pages
    .map(
      (page) =>
        `<section class="page">${scale === "fit" ? `<p class="cap">${escapeHtml(page.caption)}</p>` : ""}${page.svg}</section>`,
    )
    .join("");
  const html = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
@page{${pageRule}}
html,body{margin:0;background:#fff}
.page{${pageBox};display:flex;flex-direction:column;overflow:hidden;break-after:page}
.page:last-child{break-after:auto}
.page svg{flex:1;min-height:0;width:100%;height:100%}
.cap{margin:0 0 4mm;font:9pt -apple-system,system-ui,sans-serif;color:#444}
</style></head><body>${body}</body></html>`;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  frame.srcdoc = html;
  frame.addEventListener("load", () => {
    const win = frame.contentWindow;
    if (!win) {
      frame.remove();
      return;
    }
    win.addEventListener("afterprint", () => frame.remove());
    win.focus();
    win.print();
  });
  document.body.append(frame);
}
