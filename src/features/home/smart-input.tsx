"use client";

import { useEffect, useState } from "react";

export const EXAMPLES = [
  "Anna Lindqvist, Projektledare",
  "Dr. Erik Holm | Överläkare",
  "Wilma – Barista",
  "Marcus Holm, VD, Nordbygg AB",
];

const TYPE_MS = 55;
const HOLD_MS = 1600;
/** Id på startsidans hero — länkar hit fokuserar rutan. */
export const INPUT_ANCHOR = "borja";

/** Skriver ut exemplen tecken för tecken i platshållaren när rutan är tom. */
export function useTypewriter(active: boolean): string {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!active) return;
    let example = 0;
    let char = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const target = EXAMPLES[example]!;
      if (char <= target.length) {
        setText(target.slice(0, char++));
        timer = setTimeout(tick, TYPE_MS);
      } else {
        timer = setTimeout(() => {
          example = (example + 1) % EXAMPLES.length;
          char = 0;
          tick();
        }, HOLD_MS);
      }
    };
    tick();
    return () => clearTimeout(timer);
  }, [active]);
  return text;
}
