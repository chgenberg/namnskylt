import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { PRINT_STANDARD_COLORS, getMaterial } from "@/engine";

/**
 * Plastens färger ska vara verkstadens egna: id:t skickas rakt av i ordern.
 * Testet jämför med Skylt & Gravyrtekniks katalog när deras projekt ligger
 * bredvid det här på datorn (eller pekas ut med `SUPPLIER_CATALOG_DIR`). Det
 * läser bara. Finns projektet inte, som i CI, hoppas testet över. När deras
 * API finns ska listan hämtas därifrån i stället.
 */
const catalogDir = process.env.SUPPLIER_CATALOG_DIR ?? resolve(process.cwd(), "../Skyltochgravyr/skyltmotor");
const colorsFile = resolve(catalogDir, "packages/catalog/src/colors.ts");

interface TheirCombo {
  id: string;
  name: string;
  surface: string;
  engraving: string;
}

/** Färgerna som har ett namn i deras fil, till exempel `BLUE`, med sin hex. */
function theirNamedColors(source: string): Map<string, string> {
  const hex = new Map<string, string>();
  for (const [, name, value] of source.matchAll(/^const (\w+) = "(#[0-9A-Fa-f]{6})";$/gm)) {
    if (name && value) hex.set(name, value.toUpperCase());
  }
  return hex;
}

/** Deras standardfärger för tryck (`PRINT_STANDARD_RGB`), lästa ur källkoden. */
function theirPrintStandard(source: string): { id: string; name: string; hex: string }[] {
  const hex = theirNamedColors(source);
  const block = /export const PRINT_STANDARD_RGB = \[([\s\S]*?)\] as const;/.exec(source)?.[1] ?? "";
  return [...block.matchAll(/id: "([a-z-]+)",\s*hex: (\w+),\s*nameSv: "([^"]+)"/g)].map(([, id, token, name]) => ({
    id: id ?? "",
    name: name ?? "",
    hex: hex.get(token ?? "") ?? "",
  }));
}

/** Deras kombinationer för 2-lagers gravyrplast 1,5 mm, lästa ur källkoden. */
function theirPlastic15(source: string): TheirCombo[] {
  const hex = theirNamedColors(source);
  const color = (token: string) => (token.startsWith('"') ? token.slice(1, -1).toUpperCase() : (hex.get(token) ?? token));
  const entry = /id: "([a-z-]+)",\s*nameSv: "([^"]+)",\s*nameEn: "[^"]+",\s*background: ("#[0-9A-Fa-f]{6}"|\w+),\s*foreground: ("#[0-9A-Fa-f]{6}"|\w+)/g;
  const parse = (block: string) =>
    [...block.matchAll(entry)].map(([, id, name, background, foreground]) => ({
      id: id ?? "",
      name: name ?? "",
      surface: color(background ?? ""),
      engraving: color(foreground ?? ""),
    }));
  const base = /export const PLASTIC_COLOR_COMBOS[^=]*= \[([\s\S]*?)\] as const;/.exec(source)?.[1] ?? "";
  // Kombinationen som bara finns i 1,5 mm står för sig i deras fil.
  const extra = /const GREEN_BLACK: ColorCombo = \{([\s\S]*?)\};/.exec(source)?.[1] ?? "";
  return [...parse(base), ...parse(extra)];
}

describe("plastens färger mot verkstadens katalog", { skip: !existsSync(colorsFile) }, () => {
  it("har samma kombinationer, med samma id, namn och färgkoder", () => {
    const theirs = theirPlastic15(readFileSync(colorsFile, "utf8"));
    assert.ok(theirs.length >= 17, `bara ${theirs.length} kombinationer gick att läsa ur deras fil`);
    const ours = getMaterial("plastic").colors.map((c) => ({ id: c.id, name: c.name, surface: c.surface.toUpperCase(), engraving: c.engraving.toUpperCase() }));
    const byId = (a: TheirCombo, b: TheirCombo) => a.id.localeCompare(b.id);
    assert.deepEqual([...ours].sort(byId), [...theirs].sort(byId));
  });

  it("har samma standardfärger för tryck, i samma ordning", () => {
    const theirs = theirPrintStandard(readFileSync(colorsFile, "utf8"));
    assert.equal(theirs.length, 7, `${theirs.length} standardfärger gick att läsa ur deras fil`);
    assert.deepEqual(
      PRINT_STANDARD_COLORS.map((color) => ({ id: color.id, name: color.name, hex: color.hex })),
      theirs,
    );
  });
});
