"use client";

import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { BadgePreview } from "@/components/badge-preview";
import { createBadgeDocument, parseSmartInput } from "@/engine";
import styles from "./smart-input.module.css";

const EXAMPLES = [
  "Anna Lindqvist, Projektledare",
  "Dr. Erik Holm | Överläkare",
  "Wilma – Barista",
  "Marcus Holm, VD, Nordbygg AB",
];

const TYPE_MS = 55;
const HOLD_MS = 1600;
const ROW_LABELS = ["Namn", "Titel", "Rad 3"];
const MAX_TILT_DEG = 10;
/** Id på startsidans hero — länkar hit fokuserar rutan. */
export const INPUT_ANCHOR = "borja";

/** Skriver ut exemplen tecken för tecken i platshållaren när rutan är tom. */
function useTypewriter(active: boolean): string {
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

export function SmartInput() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [shake, setShake] = useState(0);

  const rows = useMemo(() => parseSmartInput(value), [value]);
  const doc = useMemo(() => createBadgeDocument(rows), [rows]);
  const placeholder = useTypewriter(value.length === 0);

  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const rotateY = useSpring(useTransform(pointerX, [-1, 1], [-MAX_TILT_DEG, MAX_TILT_DEG]), {
    stiffness: 160,
    damping: 18,
  });
  const rotateX = useSpring(useTransform(pointerY, [-1, 1], [MAX_TILT_DEG, -MAX_TILT_DEG]), {
    stiffness: 160,
    damping: 18,
  });

  useEffect(() => {
    router.prefetch("/skapa");
  }, [router]);

  // Länkar till #borja (menyn, "Så funkar det") ska lämna markören i rutan.
  // Next byter hash med pushState, så hashchange kommer inte — lyssna på klicket.
  useEffect(() => {
    const focusInput = () => inputRef.current?.focus({ preventScroll: true });
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest(`a[href$="#${INPUT_ANCHOR}"]`)) {
        requestAnimationFrame(focusInput);
      }
    };
    if (window.location.hash === `#${INPUT_ANCHOR}`) focusInput();
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    pointerX.set(((event.clientX - rect.left) / rect.width) * 2 - 1);
    pointerY.set(((event.clientY - rect.top) / rect.height) * 2 - 1);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (rows.length === 0) {
      setShake((n) => n + 1);
      inputRef.current?.focus();
      return;
    }
    setLeaving(true);
    const query = new URLSearchParams({ t: rows.join("|") });
    router.push(`/skapa?${query.toString()}`);
  }

  return (
    <div className={styles.root} onPointerMove={handlePointerMove}>
      <motion.form
        onSubmit={handleSubmit}
        className={`${styles.box} beam-border`}
        data-focused={focused || value.length > 0}
        animate={leaving ? { y: -24, opacity: 0, scale: 0.98 } : { y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        role="search"
      >
        <motion.div
          key={shake}
          className={styles.inputRow}
          animate={shake ? { x: [0, -8, 8, -5, 5, 0] } : undefined}
          transition={{ duration: 0.4 }}
        >
          <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="7" width="18" height="10" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M7 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <label htmlFor="badge-text" className="visually-hidden">
            Text på namnskylten
          </label>
          <input
            ref={inputRef}
            id="badge-text"
            className={styles.input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            maxLength={120}
            autoFocus
          />
          <button type="submit" className={`btn btn--primary ${styles.submit}`}>
            Skapa skylt
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </motion.div>

        <AnimatePresence initial={false}>
          {rows.length > 0 && (
            <motion.ul
              className={styles.rows}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              aria-label="Så delas texten upp"
            >
              {rows.map((row, i) => (
                <motion.li
                  key={`${i}-${ROW_LABELS[i]}`}
                  layout
                  className={styles.row}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <span className={styles.rowLabel}>{ROW_LABELS[i]}</span>
                  <span className={styles.rowText}>{row}</span>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </motion.form>

      <p className={styles.hint}>
        Separera rader med komma — <kbd>Enter</kbd> öppnar skyltmotorn
      </p>

      <div className={styles.stage} aria-live="polite">
        <AnimatePresence>
          {rows.length > 0 && (
            <motion.div
              className={styles.badge}
              style={{ rotateX, rotateY }}
              initial={{ opacity: 0, y: 24, scale: 0.92, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: 12, scale: 0.96, filter: "blur(4px)" }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <BadgePreview doc={doc} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
