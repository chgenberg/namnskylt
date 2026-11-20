"use client";

import { useState } from "react";
import { getColor, getMaterial, isPrintOnly, logoMarking, offeredColors, type BadgeDocument } from "@/engine";
import { logoColorCombo, pickedColorCombo } from "@/lib/brand/match";
import { HexInput } from "./print-color-field";
import styles from "./sections.module.css";

interface LogoColorsProps {
  doc: BadgeDocument;
  /** Loggans avlästa färger, den som täcker mest först. Kunden kan ha ändrat dem. */
  colors: readonly string[];
  /** Färgerna som de lästes av från början, när kunden har ändrat någon av dem. */
  readColors?: readonly string[];
  /** Kunden har rättat en färg. */
  onColors: (colors: string[]) => void;
  /** Kunden väljer plastfärgen som föreslås. */
  onPickCombo: (colorId: string) => void;
}

/**
 * Färgerna som lästes av ur loggan, med sina koder (besked av ägaren
 * 2026-11-19: kunden ska se vilken färgkod det är, och kunna rätta den om den
 * är fel). Koden är en skärmfärg, som i hela färgvalet. Pantone finns inte än.
 *
 * Under färgerna står vad de leder till: kombinationen i materialet som ligger
 * närmast loggans färg (`logoColorCombo`), med en knapp för att välja den. Förut
 * stod bara hemsidans färg som en prick utan kod, också när valet gjordes på loggans.
 *
 * **En färg kunden själv har ändrat styr förslaget** (besked från verkstaden via
 * ägaren 2026-11-20: Mats bytte en färg till grönt, tryckte Välj och fick en vit
 * skylt). Förslaget är då plastfärgen som ligger närmast just den färgen
 * (`pickedColorCombo`), inte den som passar loggans övriga färger. De avlästa
 * färgerna står kvar bredvid knappen Återställ.
 */
export function LogoColors({ doc, colors, readColors, onColors, onPickCombo }: LogoColorsProps) {
  const material = getMaterial(doc.materialId);
  /** Färgen kunden ändrade senast. Den glöms när sektionen stängs: då gäller den första ändrade färgen. */
  const [lastPicked, setLastPicked] = useState<string | null>(null);
  const changed = readColors ? colors.filter((color) => !readColors.includes(color)) : [];
  const wish = changed.length > 0 ? (lastPicked && changed.includes(lastPicked) ? lastPicked : changed[0]!) : null;
  // På metall finns bara tre ytor, och ingen av dem bär en vald färg: där gäller loggans färger som förut.
  const picked = wish !== null && !isPrintOnly(doc.materialId);
  const suggestedId =
    offeredColors(material).length > 1
      ? picked
        ? pickedColorCombo(doc.materialId, wish)
        : logoColorCombo({
            materialId: doc.materialId,
            logoColors: colors,
            siteColors: [],
            printedInColor: Boolean(doc.logo?.image) && logoMarking(doc) === "print",
          })
      : null;
  const suggested = suggestedId ? getColor(doc.materialId, suggestedId) : null;
  const replace = (index: number, color: string) => {
    setLastPicked(color.toUpperCase());
    onColors(colors.map((current, i) => (i === index ? color : current)));
  };
  return (
    <div className={styles.readColors}>
      <span className={styles.paletteCaption}>Avlästa färger ur loggan</span>
      <ul className={styles.readColorList}>
        {colors.map((hex, index) => (
          // Platsen i listan är nyckeln: koden ändras medan kunden rättar den.
          <li key={index} className={styles.readColor}>
            <input
              type="color"
              className={styles.readSwatch}
              aria-label={`Rätta loggans färg ${index + 1}`}
              title="Rätta färgen"
              // Väljaren kräver sex siffror i gemener.
              value={hex.toLowerCase()}
              onChange={(event) => replace(index, event.target.value.toUpperCase())}
            />
            <HexInput target={`loggans färg ${index + 1}`} value={hex.toUpperCase()} onChange={(color) => replace(index, color)} />
          </li>
        ))}
      </ul>
      <p className={styles.hint}>
        Stämmer inte en färg? Klicka på rutan eller skriv rätt kod. Färgerna styr förslagen på textfärg och färg på
        skylten. Loggan själv ändras inte.
      </p>
      {readColors && readColors.length > 0 && (
        <p className={styles.readResult}>
          <span className={styles.readOriginal}>
            Avläst från början:
            {readColors.map((hex) => (
              <span key={hex} className={styles.readDot} style={{ "--dot": hex } as React.CSSProperties} title={hex} />
            ))}
          </span>
          <button
            type="button"
            className={styles.textButton}
            onClick={() => {
              setLastPicked(null);
              onColors([...readColors]);
            }}
          >
            Återställ
          </button>
        </p>
      )}
      {suggested && suggestedId && (
        <p className={styles.readResult} data-suggested-combo={suggestedId}>
          <span>
            {picked ? "Närmast din färg" : "Närmast"} i {material.name.toLowerCase()}: <strong>{suggested.name}</strong>
          </span>
          {suggestedId === doc.colorId ? (
            <span className={styles.readChosen}>Vald</span>
          ) : (
            <button type="button" className={styles.textButton} onClick={() => onPickCombo(suggestedId)}>
              Välj
            </button>
          )}
        </p>
      )}
    </div>
  );
}
