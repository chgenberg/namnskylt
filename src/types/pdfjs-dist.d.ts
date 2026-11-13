/**
 * Den minifierade byggfilen saknar egna typer men har samma export som paketet.
 * Den används i stället för `pdf.mjs`, som inte går att ladda genom Next/webpack
 * ("Object.defineProperty called on non-object").
 */
declare module "pdfjs-dist/legacy/build/pdf.min.mjs" {
  export * from "pdfjs-dist";
}
