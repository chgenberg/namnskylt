"use client";

import { motion } from "motion/react";
import { useId, type ReactNode } from "react";

export interface SegmentedOption<T extends string> {
  id: T;
  label: ReactNode;
  title?: string;
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  const groupId = useId();
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            title={option.title}
            aria-pressed={active}
            onClick={() => onChange(option.id)}
          >
            {active && (
              <motion.span
                layoutId={`${groupId}-thumb`}
                className="segmented__thumb"
                transition={{ type: "spring", stiffness: 520, damping: 40 }}
              />
            )}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
