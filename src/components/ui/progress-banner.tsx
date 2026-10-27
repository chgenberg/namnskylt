"use client";

import { AnimatePresence, motion } from "motion/react";
import type { CSSProperties } from "react";
import { useProgress, type ProgressOptions } from "@/hooks/use-progress";
import { stepIndexAt, type ProgressStep } from "@/lib/progress/estimate";
import styles from "./progress-banner.module.css";

interface ProgressBannerProps extends ProgressOptions {
  /** Vad som pågår, för skärmläsare och som rubrik i den flytande varianten. */
  title: string;
  steps: readonly ProgressStep[];
  doneLabel?: string;
  onCancel?: () => void;
  variant?: "inline" | "floating";
}

const ENTER = { opacity: 1, y: 0, height: "auto" };

export function ProgressBanner({
  title,
  steps,
  doneLabel = "Klart",
  onCancel,
  variant = "inline",
  ...options
}: ProgressBannerProps) {
  const { phase, percent, elapsedMs } = useProgress(options);
  const done = phase === "done";
  const current = stepIndexAt(steps, percent);
  const label = done ? doneLabel : (steps[current]?.[1] ?? title);
  const shown = Math.floor(percent);

  return (
    <AnimatePresence initial={false}>
      {phase !== "hidden" && (
        <motion.div
          className={styles.banner}
          data-variant={variant}
          data-phase={phase}
          role="progressbar"
          aria-label={title}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={shown}
          aria-valuetext={`${label} · ${shown} %`}
          initial={variant === "inline" ? { opacity: 0, height: 0 } : { opacity: 0, y: 12 }}
          animate={variant === "inline" ? { opacity: 1, height: "auto" } : ENTER}
          exit={variant === "inline" ? { opacity: 0, height: 0 } : { opacity: 0, y: 8 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          style={{ "--progress": percent / 100 } as CSSProperties}
        >
          <div className={styles.inner}>
            <div className={styles.head}>
              <span className={styles.pulse} aria-hidden="true">
                {done && (
                  <svg viewBox="0 0 16 16">
                    <path d="M3.5 8.5l3 3 6-7" />
                  </svg>
                )}
              </span>
              <div className={styles.text}>
                {variant === "floating" && <span className={styles.title}>{title}</span>}
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={label}
                    className={styles.label}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                  >
                    {label}
                  </motion.span>
                </AnimatePresence>
              </div>
              <span className={`mono ${styles.percent}`}>
                {shown}
                <small>%</small>
              </span>
            </div>

            <div className={styles.track}>
              <span className={styles.fill} />
              {steps.slice(1).map(([fromPercent, stepLabel], i) => (
                <span
                  key={stepLabel}
                  className={styles.marker}
                  data-passed={done || i + 1 <= current}
                  data-label={stepLabel}
                  tabIndex={0}
                  aria-label={stepLabel}
                  style={{ "--at": `${fromPercent}%` } as CSSProperties}
                />
              ))}
            </div>

            <div className={styles.foot}>
              <span className="mono">
                {steps.length > 1 && `Steg ${done ? steps.length : current + 1} av ${steps.length} · `}
                {(elapsedMs / 1000).toFixed(elapsedMs < 10_000 ? 1 : 0)} s
              </span>
              {onCancel && phase === "running" && (
                <button type="button" className={styles.cancel} onClick={onCancel}>
                  Avbryt
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
