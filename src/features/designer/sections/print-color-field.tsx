"use client";

import { useState } from "react";
import { PRINT_STANDARD_COLORS, printHex } from "@/engine";
import styles from "./sections.module.css";

/**
 * Färgen på trycket väljs som hos Skylt & Gravyrteknik (beslut av ägaren
 * 2026-11-18): en standardfärg eller en egen färg, sparad som skärmfärg. Här
 * finns inga fält för CMYK eller PMS. Verkstadens tryckfil ritas i färgen
 * kunden ser, och printerns programvara räknar om den.
 */

interface ColorChoice {
  /** Vad färgen gäller, för skärmläsare: "trycket" eller "rad 2". */
  target: string;
  /** Den valda färgen, `#RRGGBB`, eller `null` när ingen är vald. */
  value: string | null;
  onChange: (color: string | null) => void;
}

/**
 * Fältet där färgen skrivs som hexkod. Medan kunden skriver står texten som
 * den är, och färgen sparas först när den är sex siffror. Ett tömt fält tar
 * bort färgen. En halvskriven kod släpps när fältet lämnas.
 */
function HexInput({ target, value, onChange, placeholder }: ColorChoice & { placeholder: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <span className="field">
      <input
        type="text"
        aria-label={`Hexkod för ${target}`}
        value={draft ?? value ?? ""}
        maxLength={7}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          const color = printHex(text);
          if (color) onChange(color);
          else if (text.trim() === "") onChange(null);
        }}
        onBlur={() => setDraft(null)}
      />
    </span>
  );
}

interface OwnColorProps extends ColorChoice {
  /** Färgen som visas på skylten just nu. Väljaren utgår från den när ingen egen är vald. */
  shown: string;
  placeholder: string;
}

/** En egen färg: webbläsarens färgväljare och ett fält för hexkoden, sida vid sida. */
export function OwnColor({ target, value, shown, placeholder, onChange }: OwnColorProps) {
  return (
    <>
      <input
        type="color"
        className={styles.rowSwatch}
        aria-label={`Välj färg för ${target}`}
        title="Välj färg"
        // Väljaren kräver sex siffror i gemener.
        value={(value ?? shown).toLowerCase()}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
      />
      <HexInput target={target} value={value} placeholder={placeholder} onChange={onChange} />
    </>
  );
}

/**
 * Färgen för hela trycket: standardfärgerna som rutor, och en egen färg under.
 * En ruta är markerad bara när färgen är exakt dess, så att en egen färg nära
 * en standardfärg inte ser ut att vara den.
 */
export function PrintColorField({ target, value, shown, onChange }: Omit<OwnColorProps, "placeholder">) {
  return (
    <div className={styles.printColor}>
      <div className={styles.printSwatches} role="group" aria-label={`Standardfärger för ${target}`}>
        {PRINT_STANDARD_COLORS.map((color) => (
          <button
            key={color.id}
            type="button"
            className={styles.printSwatch}
            style={{ background: color.hex }}
            aria-label={color.name}
            title={color.name}
            aria-pressed={value === color.hex}
            onClick={() => onChange(color.hex)}
          />
        ))}
      </div>
      <div className={styles.printOwn}>
        <OwnColor target={target} value={value} shown={shown} placeholder="Egen färg, till exempel #0057B8" onChange={onChange} />
        {value && (
          <button type="button" className={styles.printReset} onClick={() => onChange(null)}>
            Återställ
          </button>
        )}
      </div>
    </div>
  );
}
