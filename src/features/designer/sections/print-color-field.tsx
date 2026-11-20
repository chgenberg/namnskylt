"use client";

import { useState } from "react";
import { LOW_CONTRAST, PRINT_PALETTE, bestTextColor, contrastRatio, printColorName, printHex } from "@/engine";
import styles from "./sections.module.css";

/**
 * Friskrivningen om tryckets färg, vid varje val som printas: textfärgen och en logga som printas
 * (besked av ägaren 2026-11-20, efter mötet med verkstaden: ingen exakt nyans lovas, och ingen
 * Pantone-färg). Köpvillkoren säger samma sak med fler ord.
 */
export const PRINT_COLOR_NOTE = "Färgen i trycket kan skilja sig något från skärmen. En exakt nyans kan vi inte lova.";

/**
 * Textfärgen väljs som en skärmfärg, som hos Skylt & Gravyrteknik (beslut av
 * ägaren 2026-11-18): en av verkstadens namngivna färger, en av loggans, eller
 * en egen. Här finns inga fält för CMYK eller PMS. Verkstadens tryckfil ritas
 * i färgen kunden ser, och printerns programvara räknar om den.
 *
 * Valet står vid texten det gäller (besked av ägaren 2026-11-19, som fann det
 * under Märkningsmetod som "andra val" och såg att inget hände när raderna
 * redan hade egna färger). Den färg som gäller är alltid markerad.
 */

/** Pricken på knappen Egen färg: palettens färger i en ring, för "vilken färg som helst". */
const ANY_COLOR = `conic-gradient(${["Röd", "Gul", "Grön", "Blå", "Röd"].map((name) => PRINT_PALETTE.find((color) => color.name === name)?.hex).join(", ")})`;

interface SwatchProps {
  hex: string;
  name: string;
  active: boolean;
  onPick: () => void;
}

function Swatch({ hex, name, active, onPick }: SwatchProps) {
  return (
    <button
      type="button"
      className={styles.printSwatch}
      style={{ background: hex }}
      aria-label={name}
      title={name}
      aria-pressed={active}
      onClick={onPick}
    />
  );
}

/**
 * Fältet där en egen färg skrivs som hexkod. Medan kunden skriver står texten
 * som den är, och färgen sparas först när den är sex siffror. En halvskriven
 * kod släpps när fältet lämnas.
 */
export function HexInput({ target, value, onChange }: { target: string; value: string; onChange: (color: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <span className="field">
      <input
        type="text"
        aria-label={`Hexkod för ${target}`}
        value={draft ?? value}
        maxLength={7}
        placeholder="#0057B8"
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          setDraft(event.target.value);
          const color = printHex(event.target.value);
          if (color) onChange(color);
        }}
        onBlur={() => setDraft(null)}
      />
    </span>
  );
}

interface TextColorFieldProps {
  /** Rubriken: "Textfärg", eller "Loggans färg" när bara en enfärgad logga printas. */
  label: string;
  /** Vad färgen gäller, för skärmläsare: "texten" eller "loggan". */
  target: string;
  /** Färgen som gäller och visas på skylten, `#RRGGBB`: den valda, eller ytans förvalda. */
  shown: string;
  /** Skyltens yta, för att se vilka färger som syns mot den. */
  surface: string;
  /** Loggans färger, den som täcker mest först. Tom utan logga i färg. */
  logoColors: readonly string[];
  onChange: (color: string) => void;
}

/**
 * Färgen för allt som printas i en färg. Loggans färger står först, med den som
 * passar bäst mot skyltens yta utpekad, sedan verkstadens fjorton färger, och
 * sist en egen färg. En ruta är markerad när färgen är exakt dess.
 */
export function TextColorField({ label, target, shown, surface, logoColors, onChange }: TextColorFieldProps) {
  const current = shown.toUpperCase();
  const fromLogo = logoColors.includes(current);
  const named = printColorName(current);
  const own = !named && !fromLogo;
  // Rutan för egen färg står öppen när kunden har öppnat den, eller när färgen är en egen.
  const [opened, setOpened] = useState(false);
  const open = opened || own;
  const best = bestTextColor(logoColors, surface);
  const low = contrastRatio(current, surface) < LOW_CONTRAST;
  return (
    <div className={styles.textColor}>
      <div className={styles.textColorHead}>
        <span className={styles.sliderLabel}>{label}</span>
        <span className={styles.textColorName}>{named ?? (fromLogo ? `Från loggan, ${current}` : `Egen färg, ${current}`)}</span>
      </div>
      {logoColors.length > 0 && (
        <div className={styles.logoColors}>
          <span className={styles.paletteCaption}>Från er logga</span>
          <div className={styles.logoSwatches} role="group" aria-label={`Loggans färger för ${target}`}>
            {logoColors.map((hex) => (
              <span key={hex} className={styles.logoSwatch}>
                <Swatch hex={hex} name={hex === best ? `${hex}, passar bäst` : hex} active={current === hex} onPick={() => onChange(hex)} />
                {hex === best && <span className={styles.bestFit}>Passar bäst</span>}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className={styles.printSwatches} role="group" aria-label={`Färger för ${target}`}>
        {PRINT_PALETTE.map((color) => (
          <Swatch key={color.hex} hex={color.hex} name={color.name} active={current === color.hex} onPick={() => onChange(color.hex)} />
        ))}
      </div>
      <button type="button" className={styles.ownColorToggle} aria-expanded={open} data-active={own || undefined} onClick={() => setOpened(!open)}>
        <span className={styles.ownColorDot} style={{ background: ANY_COLOR }} aria-hidden="true" />
        Egen färg
      </button>
      {open && (
        <div className={styles.printOwn}>
          <input
            type="color"
            className={styles.rowSwatch}
            aria-label={`Välj egen färg för ${target}`}
            title="Välj färg"
            // Väljaren kräver sex siffror i gemener.
            value={current.toLowerCase()}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
          />
          <HexInput target={target} value={current} onChange={onChange} />
        </div>
      )}
      {low && (
        <p className={styles.issue} role="status">
          Färgen syns dåligt mot skylten. Välj en mörkare eller ljusare färg.
        </p>
      )}
    </div>
  );
}
